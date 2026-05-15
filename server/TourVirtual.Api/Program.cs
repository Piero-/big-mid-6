using System.Collections.Concurrent;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TourVirtual.Api.Data;
using TourVirtual.Api.Models;

var builder = WebApplication.CreateBuilder(args);
var jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET")
    ?? "cambia-este-secreto-en-produccion-big6-mid6";
var connectionString = ResolveConnectionString(builder.Configuration);
var leaderboardCache = new ConcurrentDictionary<string, CachedLeaderboard>();
var leaderboardCacheDuration = TimeSpan.FromSeconds(3);
var pgaPasswordPool = new[]
{
    "tigerwoods", "rorymcilroy", "scottiescheffler", "jonrahm", "jordanspieth", "justinthomas",
    "collinmorikawa", "xanderschauffele", "brookskoepka", "brysondechambeau", "viktorhovland",
    "hidekimatsuyama", "patrickcantlay", "tonyfinau", "maxhoma", "rickiefowler", "adamscott",
    "justinrose", "tommyfleetwood", "shanelowry", "mattfitzpatrick", "cameronsmith",
    "philMickelson".ToLowerInvariant(), "dustinJohnson".ToLowerInvariant(), "bubbawatson", "sergiogarcia",
    "ernieels", "vijaysingh", "fredcouples", "garyplayer", "jacknicklaus", "arnoldpalmer",
    "bencrenshaw", "nickfaldo", "seveballesteros", "gregnorman", "davidduval", "paynestewart",
    "markomeara", "tomwatson", "leerino", "rayfloyd", "halSutton".ToLowerInvariant(), "zachjohnson"
};

var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (IsPostgresConnectionString(connectionString))
    {
        options.UseNpgsql(connectionString);
    }
    else
    {
        options.UseSqlite(connectionString);
    }
});
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var origins = ResolveAllowedOrigins(builder.Configuration);
        policy.AllowAnyHeader().AllowAnyMethod();
        if (origins.Length > 0)
        {
            policy.SetIsOriginAllowed(origin => IsAllowedOrigin(origin, origins));
        }
        else
        {
            policy.AllowAnyOrigin();
        }
    });
});

var app = builder.Build();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    await EnsureRuntimeSchema(db);
    await SeedDatabase(db);
    await EnsureAdminPassword(db);
    await EnsureDefaultTeamSlots(db, pgaPasswordPool);
}

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/healthz", () => Results.Ok(new { status = "ok" }));

app.MapPost("/api/auth/login", async (LoginRequest request, AppDbContext db) =>
{
    var user = await db.Users
        .Include(item => item.Team)
        .ThenInclude(item => item!.Tournament)
        .FirstOrDefaultAsync(item => item.Username == request.Username);
    if (user is null || !VerifyPassword(request.Password, user.PasswordSalt, user.PasswordHash))
    {
        return Results.Unauthorized();
    }

    var token = CreateJwt(user, jwtSecret);
    return Results.Ok(new
    {
        token,
        role = user.Role,
        username = user.Username,
        teamId = user.TeamId,
        teamName = user.Team?.Name,
        tournamentSlug = user.Team?.Tournament?.Slug
    });
});

app.MapGet("/api/tournaments", async (AppDbContext db) =>
{
    var tournamentEntities = await db.Tournaments.AsNoTracking()
        .OrderBy(item => item.Name)
        .ToListAsync();
    var tournaments = tournamentEntities.Select(TournamentSummary);
    return Results.Ok(tournaments);
});

app.MapGet("/api/tournaments/{slug}", async (string slug, AppDbContext db) =>
{
    var tournament = await LoadTournament(db, slug);
    return tournament is null ? Results.NotFound() : Results.Ok(TournamentDetail(tournament));
});

app.MapGet("/api/leaderboards/{slug}", async (string slug, AppDbContext db) =>
{
    var cacheKey = NormalizeCacheKey(slug);
    if (leaderboardCache.TryGetValue(cacheKey, out var cached)
        && DateTimeOffset.UtcNow - cached.CachedAt < leaderboardCacheDuration)
    {
        return Results.Ok(cached.Payload);
    }

    var tournament = await LoadTournament(db, slug);
    if (tournament is null)
    {
        return Results.NotFound();
    }

    var payload = BuildLeaderboard(tournament);
    leaderboardCache[cacheKey] = new CachedLeaderboard(DateTimeOffset.UtcNow, payload);
    return Results.Ok(payload);
});

app.MapGet("/api/me", async (HttpContext httpContext, AppDbContext db) =>
{
    var actor = ReadActor(httpContext, jwtSecret);
    if (actor is null)
    {
        return Results.Unauthorized();
    }

    var user = await db.Users.AsNoTracking()
        .Include(item => item.Team)
        .ThenInclude(item => item!.Tournament)
        .FirstOrDefaultAsync(item => item.Id == actor.UserId);

    return user is null
        ? Results.Unauthorized()
        : Results.Ok(new { user.Username, user.Role, user.TeamId, teamName = user.Team?.Name, tournamentSlug = user.Team?.Tournament?.Slug });
});

app.MapPut("/api/teams/{teamId:int}/scores/{holeNumber:int}", async (
    int teamId,
    int holeNumber,
    ScoreRequest request,
    HttpContext httpContext,
    AppDbContext db) =>
{
    var actor = ReadActor(httpContext, jwtSecret);
    if (actor is null)
    {
        return Results.Unauthorized();
    }

    var team = await db.Teams
        .Include(item => item.Tournament)
        .Include(item => item.Scores)
        .FirstOrDefaultAsync(item => item.Id == teamId);
    if (team?.Tournament is null)
    {
        return Results.NotFound();
    }

    if (team.Tournament.IsClosed)
    {
        return Results.Conflict(new { error = "El torneo esta cerrado y no admite ediciones." });
    }

    if (!actor.IsAdmin && actor.TeamId != team.Id)
    {
        return Results.Forbid();
    }

    if (holeNumber < 1 || holeNumber > 18 || request.GrossScore < 1 || request.GrossScore > 20)
    {
        return Results.BadRequest(new { error = "Score u hoyo fuera de rango." });
    }

    var entry = team.Scores.FirstOrDefault(item => item.HoleNumber == holeNumber);
    var previousScore = entry?.GrossScore;
    if (entry is null)
    {
        entry = new ScoreEntry { TeamId = team.Id, HoleNumber = holeNumber };
        db.Scores.Add(entry);
    }

    entry.GrossScore = request.GrossScore;
    entry.Confirmed = request.Confirmed;
    entry.UpdatedAt = DateTimeOffset.UtcNow;
    team.UpdatedAt = entry.UpdatedAt;
    team.Tournament.UpdatedAt = entry.UpdatedAt;
    db.ScoreAuditLogs.Add(new ScoreAuditLog
    {
        TournamentId = team.TournamentId,
        TeamId = team.Id,
        HoleNumber = holeNumber,
        PreviousScore = previousScore,
        NewScore = request.GrossScore,
        ChangedBy = actor.Username,
        Role = actor.Role,
        ChangedAt = entry.UpdatedAt
    });
    await db.SaveChangesAsync();
    InvalidateLeaderboardCache(team.Tournament.Slug);

    return Results.Ok(new
    {
        entry.HoleNumber,
        entry.GrossScore,
        entry.Confirmed,
        entry.UpdatedAt
    });
});

app.MapGet("/api/admin/audit/{slug}", async (string slug, HttpContext httpContext, AppDbContext db) =>
{
    var actor = ReadActor(httpContext, jwtSecret);
    if (actor?.IsAdmin != true)
    {
        return Results.Unauthorized();
    }

    var tournament = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(item => item.Slug == slug);
    if (tournament is null)
    {
        return Results.NotFound();
    }

    var logs = await db.ScoreAuditLogs.AsNoTracking()
        .Where(item => item.TournamentId == tournament.Id)
        .OrderByDescending(item => item.Id)
        .Take(24)
        .ToListAsync();
    return Results.Ok(logs);
});

app.MapPost("/api/admin/tournaments/{slug}/status", async (
    string slug,
    TournamentStatusRequest request,
    HttpContext httpContext,
    AppDbContext db) =>
{
    var actor = ReadActor(httpContext, jwtSecret);
    if (actor?.IsAdmin != true)
    {
        return Results.Unauthorized();
    }

    var tournament = await db.Tournaments
        .Include(item => item.Holes)
        .FirstOrDefaultAsync(item => item.Slug == slug);
    if (tournament is null)
    {
        return Results.NotFound();
    }

    var validStatuses = new[] { "upcoming", "active", "paused", "finished" };
    if (!validStatuses.Contains(request.Status, StringComparer.OrdinalIgnoreCase))
    {
        return Results.BadRequest(new { error = "Estado de torneo invalido." });
    }

    tournament.Status = request.Status.ToLowerInvariant();
    tournament.IsClosed = request.IsClosed;
    tournament.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    InvalidateLeaderboardCache(slug);
    return Results.Ok(TournamentSummary(tournament));
});

app.MapPost("/api/admin/tournaments/{slug}/reset-scores", async (
    string slug,
    HttpContext httpContext,
    AppDbContext db) =>
{
    var actor = ReadActor(httpContext, jwtSecret);
    if (actor?.IsAdmin != true)
    {
        return Results.Unauthorized();
    }

    var tournament = await db.Tournaments
        .Include(item => item.Teams)
        .ThenInclude(item => item.Scores)
        .FirstOrDefaultAsync(item => item.Slug == slug);
    if (tournament is null)
    {
        return Results.NotFound();
    }

    var now = DateTimeOffset.UtcNow;
    var scores = tournament.Teams.SelectMany(item => item.Scores).ToList();
    foreach (var score in scores)
    {
        db.ScoreAuditLogs.Add(new ScoreAuditLog
        {
            TournamentId = tournament.Id,
            TeamId = score.TeamId,
            HoleNumber = score.HoleNumber,
            PreviousScore = score.GrossScore,
            NewScore = 0,
            ChangedBy = actor.Username,
            Role = actor.Role,
            ChangedAt = now
        });
    }

    db.Scores.RemoveRange(scores);
    foreach (var team in tournament.Teams)
    {
        team.UpdatedAt = now;
    }

    tournament.UpdatedAt = now;
    await db.SaveChangesAsync();
    InvalidateLeaderboardCache(slug);
    return Results.Ok(new { deletedScores = scores.Count });
});

app.MapPut("/api/admin/tournaments/{slug}", async (
    string slug,
    AdminTournamentRequest request,
    HttpContext httpContext,
    AppDbContext db) =>
{
    var actor = ReadActor(httpContext, jwtSecret);
    if (actor?.IsAdmin != true)
    {
        return Results.Unauthorized();
    }

    var tournament = await db.Tournaments
        .Include(item => item.Holes)
        .FirstOrDefaultAsync(item => item.Slug == slug);
    if (tournament is null)
    {
        return Results.NotFound();
    }

    var validStatuses = new[] { "upcoming", "active", "paused", "finished" };
    if (!validStatuses.Contains(request.Status, StringComparer.OrdinalIgnoreCase))
    {
        return Results.BadRequest(new { error = "Estado de torneo invalido." });
    }

    tournament.Name = request.Name.Trim();
    tournament.CourseName = request.CourseName.Trim();
    tournament.StartsAt = request.StartsAt;
    tournament.Format = request.Format.Trim();
    tournament.StartMode = request.StartMode.Trim();
    tournament.Status = request.Status.ToLowerInvariant();
    tournament.IsClosed = request.IsClosed;
    tournament.Theme = request.Theme.Trim();
    tournament.UpdatedAt = DateTimeOffset.UtcNow;

    foreach (var holeRequest in (request.Holes ?? []).Where(item => item.Number is >= 1 and <= 18))
    {
        var hole = tournament.Holes.FirstOrDefault(item => item.Number == holeRequest.Number);
        if (hole is null)
        {
            db.Holes.Add(new Hole
            {
                TournamentId = tournament.Id,
                Number = holeRequest.Number,
                Par = holeRequest.Par
            });
        }
        else
        {
            hole.Par = holeRequest.Par;
        }
    }

    await db.SaveChangesAsync();
    InvalidateLeaderboardCache(slug);
    return Results.Ok(TournamentSummary(tournament));
});

app.MapPut("/api/admin/tournaments/{slug}/podium", async (
    string slug,
    PodiumRequest request,
    HttpContext httpContext,
    AppDbContext db) =>
{
    var actor = ReadActor(httpContext, jwtSecret);
    if (actor?.IsAdmin != true)
    {
        return Results.Unauthorized();
    }

    var tournament = await db.Tournaments
        .Include(item => item.PodiumSetting)
        .Include(item => item.Teams)
        .FirstOrDefaultAsync(item => item.Slug == slug);
    if (tournament is null)
    {
        return Results.NotFound();
    }

    var teamIds = await db.Teams
        .Where(item => item.TournamentId == tournament.Id)
        .Select(item => item.Id)
        .ToListAsync();

    if (!IsValidPodiumTeam(request.FirstTeamId, teamIds)
        || !IsValidPodiumTeam(request.SecondTeamId, teamIds)
        || !IsValidPodiumTeam(request.ThirdTeamId, teamIds))
    {
        return Results.BadRequest(new { error = "El podio solo puede usar equipos del torneo." });
    }

    var setting = tournament.PodiumSetting;
    if (setting is null)
    {
        setting = new PodiumSetting { TournamentId = tournament.Id };
        db.PodiumSettings.Add(setting);
    }

    setting.FirstTeamId = request.FirstTeamId;
    setting.SecondTeamId = request.SecondTeamId;
    setting.ThirdTeamId = request.ThirdTeamId;
    setting.FirstPrize = request.FirstPrize;
    setting.SecondPrize = request.SecondPrize;
    setting.ThirdPrize = request.ThirdPrize;
    setting.UpdatedAt = DateTimeOffset.UtcNow;
    tournament.UpdatedAt = setting.UpdatedAt;
    await db.SaveChangesAsync();
    InvalidateLeaderboardCache(slug);
    return Results.Ok(new { tournament.Slug, podium = PodiumDto(setting, tournament.Teams) });
});

app.MapPost("/api/admin/teams", async (
    AdminTeamRequest request,
    HttpContext httpContext,
    AppDbContext db) =>
{
    var actor = ReadActor(httpContext, jwtSecret);
    if (actor?.IsAdmin != true)
    {
        return Results.Unauthorized();
    }

    var tournament = await db.Tournaments.FirstOrDefaultAsync(item => item.Slug == request.TournamentSlug);
    if (tournament is null)
    {
        return Results.NotFound();
    }

    var team = new Team
    {
        TournamentId = tournament.Id,
        Name = request.Name.Trim(),
        StartingHole = request.StartingHole,
        Participants = NormalizeParticipants(request.Participants, request.JudgeName),
        UpdatedAt = DateTimeOffset.UtcNow
    };
    db.Teams.Add(team);
    await db.SaveChangesAsync();
    InvalidateLeaderboardCache(tournament.Slug);

    var username = await BuildUniqueUsername(db, team.Name);
    var password = GenerateTeamPassword(team, await db.Teams.Where(item => item.TournamentId == tournament.Id).OrderBy(item => item.Id).ToListAsync(), pgaPasswordPool);
    var (salt, hash) = HashPassword(password);
    db.Users.Add(new AppUser
    {
        Username = username,
        Role = "Team",
        TeamId = team.Id,
        PasswordSalt = salt,
        PasswordHash = hash
    });
    await db.SaveChangesAsync();

    return Results.Ok(new { team.Id, team.Name, team.StartingHole, team.Participants, username });
});

app.MapPut("/api/admin/teams/{teamId:int}", async (
    int teamId,
    AdminTeamUpdateRequest request,
    HttpContext httpContext,
    AppDbContext db) =>
{
    var actor = ReadActor(httpContext, jwtSecret);
    if (actor?.IsAdmin != true)
    {
        return Results.Unauthorized();
    }

    var team = await db.Teams.Include(item => item.Tournament).FirstOrDefaultAsync(item => item.Id == teamId);
    if (team is null)
    {
        return Results.NotFound();
    }

    team.Name = request.Name.Trim();
    team.StartingHole = request.StartingHole;
    team.Participants = NormalizeParticipants(request.Participants, request.JudgeName);
    team.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    if (team.Tournament is not null)
    {
        InvalidateLeaderboardCache(team.Tournament.Slug);
    }
    return Results.Ok(new { team.Id, team.Name, team.StartingHole, team.Participants });
});

app.MapPut("/api/admin/tournaments/{slug}/team-count", async (
    string slug,
    TeamCountRequest request,
    HttpContext httpContext,
    AppDbContext db) =>
{
    var actor = ReadActor(httpContext, jwtSecret);
    if (actor?.IsAdmin != true)
    {
        return Results.Unauthorized();
    }

    if (request.Count < 0 || request.Count > 22)
    {
        return Results.BadRequest(new { error = "La cantidad de equipos debe estar entre 0 y 22." });
    }

    var tournament = await db.Tournaments
        .Include(item => item.Teams)
            .ThenInclude(item => item.Users)
        .Include(item => item.Teams)
            .ThenInclude(item => item.Scores)
        .FirstOrDefaultAsync(item => item.Slug == slug);
    if (tournament is null)
    {
        return Results.NotFound();
    }

    var teams = tournament.Teams.OrderBy(item => item.Id).ToList();
    while (teams.Count < request.Count)
    {
        var number = teams.Count + 1;
        var prefix = tournament.Slug.StartsWith("mid", StringComparison.OrdinalIgnoreCase) ? "MID" : "BIG";
        var team = new Team
        {
            TournamentId = tournament.Id,
            Name = $"{prefix} Equipo {number}",
            StartingHole = ((number - 1) % 18) + 1,
            Participants = string.Empty,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Teams.Add(team);
        await db.SaveChangesAsync();

        var username = await BuildUniqueUsername(db, team.Name);
        var password = GenerateTeamPassword(team, teams.Append(team), pgaPasswordPool);
        var (salt, hash) = HashPassword(password);
        db.Users.Add(new AppUser
        {
            Username = username,
            Role = "Team",
            TeamId = team.Id,
            PasswordSalt = salt,
            PasswordHash = hash
        });
        teams.Add(team);
    }

    while (teams.Count > request.Count)
    {
        var team = teams[^1];
        db.Scores.RemoveRange(team.Scores);
        db.Users.RemoveRange(team.Users);
        db.Teams.Remove(team);
        teams.RemoveAt(teams.Count - 1);
    }

    tournament.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    InvalidateLeaderboardCache(slug);
    return Results.Ok(new { tournament.Slug, count = request.Count });
});

app.MapPost("/api/admin/teams/{teamId:int}/login-copy", async (
    int teamId,
    HttpContext httpContext,
    AppDbContext db) =>
{
    var actor = ReadActor(httpContext, jwtSecret);
    if (actor?.IsAdmin != true)
    {
        return Results.Unauthorized();
    }

    var team = await db.Teams
        .Include(item => item.Tournament)
        .Include(item => item.Users)
        .FirstOrDefaultAsync(item => item.Id == teamId);
    if (team?.Tournament is null)
    {
        return Results.NotFound();
    }

    var allTeams = await db.Teams
        .Where(item => item.TournamentId == team.TournamentId)
        .OrderBy(item => item.Id)
        .ToListAsync();
    var user = team.Users.OrderBy(item => item.Id).FirstOrDefault();
    if (user is null)
    {
        var username = await BuildUniqueUsername(db, team.Name);
        user = new AppUser { Username = username, Role = "Team", TeamId = team.Id };
        db.Users.Add(user);
    }

    var password = GenerateTeamPassword(team, allTeams, pgaPasswordPool);
    var (salt, hash) = HashPassword(password);
    user.PasswordSalt = salt;
    user.PasswordHash = hash;
    user.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();

    return Results.Ok(new { user.Username, password, tournamentSlug = team.Tournament.Slug, tournamentName = team.Tournament.Name });
});

app.MapDelete("/api/admin/teams/{teamId:int}", async (int teamId, HttpContext httpContext, AppDbContext db) =>
{
    var actor = ReadActor(httpContext, jwtSecret);
    if (actor?.IsAdmin != true)
    {
        return Results.Unauthorized();
    }

    var team = await db.Teams.Include(item => item.Tournament).Include(item => item.Scores).Include(item => item.Users).FirstOrDefaultAsync(item => item.Id == teamId);
    if (team is null)
    {
        return Results.NotFound();
    }

    db.Scores.RemoveRange(team.Scores);
    db.Users.RemoveRange(team.Users);
    db.Teams.Remove(team);
    await db.SaveChangesAsync();
    if (team.Tournament is not null)
    {
        InvalidateLeaderboardCache(team.Tournament.Slug);
    }
    return Results.NoContent();
});

app.MapPost("/api/admin/users/reset-password", async (
    ResetPasswordRequest request,
    HttpContext httpContext,
    AppDbContext db) =>
{
    var actor = ReadActor(httpContext, jwtSecret);
    if (actor?.IsAdmin != true)
    {
        return Results.Unauthorized();
    }

    var user = await db.Users.FirstOrDefaultAsync(item => item.Username == request.Username);
    if (user is null)
    {
        return Results.NotFound();
    }

    var password = string.IsNullOrWhiteSpace(request.NewPassword) ? "equipo2026" : request.NewPassword;
    var (salt, hash) = HashPassword(password);
    user.PasswordSalt = salt;
    user.PasswordHash = hash;
    user.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(new { user.Username, temporaryPassword = password });
});

app.MapFallbackToFile("index.html");
app.Run();

static async Task SeedDatabase(AppDbContext db)
{
    if (await db.Tournaments.AnyAsync())
    {
        return;
    }

    var big6 = CreateTournament("big-6", "BIG 6", "oscuro", DateTimeOffset.UtcNow.AddDays(12));
    var mid6 = CreateTournament("mid-6", "MID 6", "claro", DateTimeOffset.UtcNow.AddDays(12).AddHours(1));
    db.Tournaments.AddRange(big6, mid6);
    await db.SaveChangesAsync();

    var bigTeams = CreateTeams(big6.Id, "BIG", 22);
    var midTeams = CreateTeams(mid6.Id, "MID", 22);
    db.Teams.AddRange(bigTeams);
    db.Teams.AddRange(midTeams);
    await db.SaveChangesAsync();

    var (adminSalt, adminHash) = HashPassword("mitre1111");
    db.Users.Add(new AppUser
    {
        Username = "admin",
        Role = "Admin",
        PasswordSalt = adminSalt,
        PasswordHash = adminHash
    });

    foreach (var team in bigTeams.Concat(midTeams))
    {
        var slug = team.Name.ToLowerInvariant().Replace(" ", string.Empty, StringComparison.Ordinal);
        var (salt, hash) = HashPassword("equipo2026");
        db.Users.Add(new AppUser
        {
            Username = slug,
            Role = "Team",
            TeamId = team.Id,
            PasswordSalt = salt,
            PasswordHash = hash
        });
    }

    SeedScores(db, bigTeams[0], [4, 4, 3, 5, 4, 4]);
    SeedScores(db, bigTeams[1], [5, 4, 4, 4, 4]);
    SeedScores(db, midTeams[0], [4, 3, 4, 5, 4, 3, 4]);
    SeedScores(db, midTeams[1], [5, 4, 4, 4]);
    await db.SaveChangesAsync();
}

static async Task EnsureAdminPassword(AppDbContext db)
{
    var admin = await db.Users.FirstOrDefaultAsync(item => item.Username == "admin");
    var (salt, hash) = HashPassword("mitre1111");
    if (admin is null)
    {
        db.Users.Add(new AppUser
        {
            Username = "admin",
            Role = "Admin",
            PasswordSalt = salt,
            PasswordHash = hash
        });
    }
    else
    {
        admin.Role = "Admin";
        admin.PasswordSalt = salt;
        admin.PasswordHash = hash;
        admin.UpdatedAt = DateTimeOffset.UtcNow;
    }

    await db.SaveChangesAsync();
}

static async Task EnsureDefaultTeamSlots(AppDbContext db, IReadOnlyList<string> pgaPasswordPool)
{
    var tournaments = await db.Tournaments
        .Include(item => item.Teams)
            .ThenInclude(item => item.Users)
        .ToListAsync();

    foreach (var tournament in tournaments)
    {
        var teams = tournament.Teams.OrderBy(item => item.Id).ToList();
        while (teams.Count < 22)
        {
            var number = teams.Count + 1;
            var prefix = tournament.Slug.StartsWith("mid", StringComparison.OrdinalIgnoreCase) ? "MID" : "BIG";
            var team = new Team
            {
                TournamentId = tournament.Id,
                Name = $"{prefix} Equipo {number}",
                StartingHole = ((number - 1) % 18) + 1,
                Participants = string.Empty,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            db.Teams.Add(team);
            await db.SaveChangesAsync();

            var username = await BuildUniqueUsername(db, team.Name);
            var password = GenerateTeamPassword(team, teams.Append(team), pgaPasswordPool);
            var (salt, hash) = HashPassword(password);
            db.Users.Add(new AppUser
            {
                Username = username,
                Role = "Team",
                TeamId = team.Id,
                PasswordSalt = salt,
                PasswordHash = hash
            });
            teams.Add(team);
        }
    }

    await db.SaveChangesAsync();
}

static async Task EnsureRuntimeSchema(AppDbContext db)
{
    if (db.Database.IsSqlite())
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "PodiumSettings" (
                "Id" INTEGER NOT NULL CONSTRAINT "PK_PodiumSettings" PRIMARY KEY AUTOINCREMENT,
                "TournamentId" INTEGER NOT NULL,
                "FirstTeamId" INTEGER NULL,
                "SecondTeamId" INTEGER NULL,
                "ThirdTeamId" INTEGER NULL,
                "FirstPrize" TEXT NOT NULL DEFAULT '0',
                "SecondPrize" TEXT NOT NULL DEFAULT '0',
                "ThirdPrize" TEXT NOT NULL DEFAULT '0',
                "UpdatedAt" TEXT NOT NULL,
                CONSTRAINT "FK_PodiumSettings_Tournaments_TournamentId" FOREIGN KEY ("TournamentId") REFERENCES "Tournaments" ("Id") ON DELETE CASCADE
            );
            """);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PodiumSettings_TournamentId"
            ON "PodiumSettings" ("TournamentId");
            """);
    }
    else
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "PodiumSettings" (
                "Id" integer GENERATED BY DEFAULT AS IDENTITY,
                "TournamentId" integer NOT NULL,
                "FirstTeamId" integer NULL,
                "SecondTeamId" integer NULL,
                "ThirdTeamId" integer NULL,
                "FirstPrize" numeric(12,2) NOT NULL DEFAULT 0,
                "SecondPrize" numeric(12,2) NOT NULL DEFAULT 0,
                "ThirdPrize" numeric(12,2) NOT NULL DEFAULT 0,
                "UpdatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_PodiumSettings" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_PodiumSettings_Tournaments_TournamentId" FOREIGN KEY ("TournamentId") REFERENCES "Tournaments" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PodiumSettings_TournamentId"
            ON "PodiumSettings" ("TournamentId");
            """);
    }
}

static Tournament CreateTournament(string slug, string name, string theme, DateTimeOffset startsAt)
{
    var pars = new[] { 4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4 };
    return new Tournament
    {
        Slug = slug,
        Name = name,
        Theme = theme,
        StartsAt = startsAt,
        Status = "active",
        Holes = pars.Select((par, index) => new Hole { Number = index + 1, Par = par }).ToList()
    };
}

static List<Team> CreateTeams(int tournamentId, string prefix, int count) =>
    Enumerable.Range(1, count).Select(number => new Team
    {
        TournamentId = tournamentId,
        Name = $"{prefix} Equipo {number}",
        StartingHole = ((number - 1) % 18) + 1,
        Participants = string.Join(" | ", Enumerable.Range(1, 6).Select(item => $"Jugador {item}"))
    }).ToList();

static void SeedScores(AppDbContext db, Team team, int[] scores)
{
    for (var index = 0; index < scores.Length; index++)
    {
        db.Scores.Add(new ScoreEntry
        {
            TeamId = team.Id,
            HoleNumber = index + 1,
            GrossScore = scores[index],
            Confirmed = true,
            UpdatedAt = DateTimeOffset.UtcNow.AddMinutes(-index * 2)
        });
    }
}

static async Task<Tournament?> LoadTournament(AppDbContext db, string slug) =>
    await db.Tournaments.AsNoTracking()
        .Include(item => item.PodiumSetting)
        .Include(item => item.Holes)
        .Include(item => item.Teams)
            .ThenInclude(item => item.Scores)
        .Include(item => item.Teams)
            .ThenInclude(item => item.Users)
        .FirstOrDefaultAsync(item => item.Slug == slug);

static object TournamentSummary(Tournament tournament) => new
{
    tournament.Id,
    tournament.Slug,
    tournament.Name,
    tournament.CourseName,
    tournament.StartsAt,
    tournament.Format,
    tournament.StartMode,
    tournament.Status,
    tournament.IsClosed,
    tournament.Theme,
    tournament.UpdatedAt
};

static object TournamentDetail(Tournament tournament) => new
{
    tournament.Id,
    tournament.Slug,
    tournament.Name,
    tournament.CourseName,
    tournament.StartsAt,
    tournament.Format,
    tournament.StartMode,
    tournament.Status,
    tournament.IsClosed,
    tournament.Theme,
    tournament.UpdatedAt,
    podium = tournament.PodiumSetting is null ? null : PodiumDto(tournament.PodiumSetting, tournament.Teams),
    holes = tournament.Holes.OrderBy(item => item.Number).Select(item => new { item.Number, item.Par }),
    teams = tournament.Teams.OrderBy(item => item.Name).Select(item => new
    {
        item.Id,
        item.Name,
        item.StartingHole,
        username = item.Users.OrderBy(user => user.Id).FirstOrDefault()?.Username,
        participants = ParticipantNames(item.Participants),
        participantHandicaps = ParticipantHandicaps(item.Participants),
        judgeName = JudgeName(item.Participants),
        scores = item.Scores.OrderBy(score => score.HoleNumber).Select(score => new
        {
            score.HoleNumber,
            score.GrossScore,
            score.Confirmed,
            score.UpdatedAt
        })
    })
};

static object BuildLeaderboard(Tournament tournament)
{
    var parByHole = tournament.Holes.ToDictionary(item => item.Number, item => item.Par);
    var rows = tournament.Teams.Select(team =>
    {
        var scores = team.Scores.OrderBy(item => item.HoleNumber).ToList();
        var gross = scores.Sum(item => item.GrossScore);
        var relative = scores.Sum(item => item.GrossScore - parByHole.GetValueOrDefault(item.HoleNumber, 0));
        var lastUpdated = scores.Count > 0 ? scores.Max(item => item.UpdatedAt) : team.UpdatedAt;
        return new LeaderboardRow(
            team.Id,
            team.Name,
            gross,
            relative,
            scores.Count,
            lastUpdated,
            scores.Count == 0 ? team.StartingHole : Math.Min(18, scores.Max(item => item.HoleNumber) + 1));
    })
    .OrderBy(item => item.HolesCompleted == 0)
    .ThenBy(item => item.RelativeToPar)
    .ThenByDescending(item => item.HolesCompleted)
    .ThenBy(item => item.TotalScore)
    .ThenBy(item => item.TeamName)
    .ToList();

    var position = 0;
    var playedIndex = 0;
    int? previousRelative = null;
    var positionedRows = rows.Select(row =>
    {
        if (row.HolesCompleted == 0)
        {
            return row with { Position = 0 };
        }

        playedIndex++;
        if (previousRelative != row.RelativeToPar)
        {
            position = playedIndex;
        }

        previousRelative = row.RelativeToPar;
        return row with { Position = position };
    }).ToList();

    var tieCounts = positionedRows
        .Where(row => row.HolesCompleted > 0)
        .GroupBy(row => row.RelativeToPar)
        .ToDictionary(group => group.Key, group => group.Count());

    var rankedRows = positionedRows.Select(row =>
    {
        var isUnplayed = row.HolesCompleted == 0;
        var isTied = !isUnplayed && tieCounts.GetValueOrDefault(row.RelativeToPar) > 1;
        var displayPosition = isUnplayed ? string.Empty : isTied ? $"T{row.Position}" : row.Position.ToString(CultureInfo.InvariantCulture);

        return new
        {
            position = isUnplayed ? (int?)null : row.Position,
            displayPosition,
            row.TeamId,
            row.TeamName,
            participants = ParticipantNames(tournament.Teams.FirstOrDefault(team => team.Id == row.TeamId)?.Participants ?? string.Empty),
            row.TotalScore,
            row.RelativeToPar,
            scoreLabel = FormatRelativeScore(row.RelativeToPar),
            row.HolesCompleted,
            row.LastUpdated,
            row.CurrentHole,
            tied = isTied
        };
    });

    return new
    {
        tournament = TournamentSummary(tournament),
        podium = tournament.PodiumSetting is null || !IsCompletePodium(tournament.PodiumSetting)
            ? null
            : PodiumDto(tournament.PodiumSetting, tournament.Teams),
        rows = rankedRows,
        refreshedAt = DateTimeOffset.UtcNow
    };
}

string NormalizeCacheKey(string slug) => slug.Trim().ToLowerInvariant();

void InvalidateLeaderboardCache(string slug)
{
    leaderboardCache.TryRemove(NormalizeCacheKey(slug), out _);
}

static object PodiumDto(PodiumSetting setting, IEnumerable<Team> teams)
{
    var teamById = teams.ToDictionary(item => item.Id, item => item.Name);
    return new
    {
        first = PodiumPlaceDto(setting.FirstTeamId, setting.FirstPrize, teamById),
        second = PodiumPlaceDto(setting.SecondTeamId, setting.SecondPrize, teamById),
        third = PodiumPlaceDto(setting.ThirdTeamId, setting.ThirdPrize, teamById),
        setting.UpdatedAt
    };
}

static object PodiumPlaceDto(int? teamId, decimal prize, IReadOnlyDictionary<int, string> teamById) => new
{
    teamId,
    teamName = teamId.HasValue && teamById.TryGetValue(teamId.Value, out var teamName) ? teamName : null,
    prize
};

static bool IsValidPodiumTeam(int? teamId, IReadOnlyCollection<int> teamIds) =>
    !teamId.HasValue || teamIds.Contains(teamId.Value);

static bool IsCompletePodium(PodiumSetting setting) =>
    setting.FirstTeamId.HasValue && setting.SecondTeamId.HasValue && setting.ThirdTeamId.HasValue;

static string FormatRelativeScore(int score) => score switch
{
    0 => "E",
    > 0 => $"+{score}",
    _ => score.ToString()
};

static string NormalizeParticipants(IEnumerable<string> participants, string? judgeName = null)
{
    var names = participants.Where(item => !string.IsNullOrWhiteSpace(item)).Take(6).Select(item => item.Trim()).ToList();
    if (!string.IsNullOrWhiteSpace(judgeName))
    {
        names.Add($"JUEZ:{judgeName.Trim()}");
    }

    return string.Join(" | ", names);
}

static string[] ParticipantNames(string participants) =>
    participants
        .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Where(item => !item.StartsWith("JUEZ:", StringComparison.OrdinalIgnoreCase))
        .Select(ParticipantName)
        .ToArray();

static string[] ParticipantHandicaps(string participants) =>
    participants
        .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Where(item => !item.StartsWith("JUEZ:", StringComparison.OrdinalIgnoreCase))
        .Select(ParticipantHandicap)
        .ToArray();

static string ParticipantName(string participant)
{
    var markerIndex = participant.IndexOf("::HCP:", StringComparison.OrdinalIgnoreCase);
    return (markerIndex < 0 ? participant : participant[..markerIndex]).Trim();
}

static string ParticipantHandicap(string participant)
{
    var markerIndex = participant.IndexOf("::HCP:", StringComparison.OrdinalIgnoreCase);
    return markerIndex < 0 ? string.Empty : participant[(markerIndex + "::HCP:".Length)..].Trim();
}

static string JudgeName(string participants) =>
    participants
        .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .FirstOrDefault(item => item.StartsWith("JUEZ:", StringComparison.OrdinalIgnoreCase))?
        .Replace("JUEZ:", string.Empty, StringComparison.OrdinalIgnoreCase)
        .Trim() ?? string.Empty;

static string GenerateTeamPassword(Team team, IEnumerable<Team> tournamentTeams, IReadOnlyList<string> passwordPool)
{
    var teams = tournamentTeams.OrderBy(item => item.Id).ToList();
    var index = Math.Max(0, teams.FindIndex(item => item.Id == team.Id));
    var token = passwordPool[index % passwordPool.Count];
    return NormalizePasswordToken(index >= passwordPool.Count ? $"{token}{(index / passwordPool.Count) + 1}" : token);
}

static string NormalizePasswordToken(string value) =>
    new(value.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());

static async Task<string> BuildUniqueUsername(AppDbContext db, string teamName)
{
    var baseUsername = new string(teamName
        .ToLowerInvariant()
        .Where(char.IsLetterOrDigit)
        .ToArray());

    if (string.IsNullOrWhiteSpace(baseUsername))
    {
        baseUsername = "equipo";
    }

    var username = baseUsername;
    var suffix = 2;
    while (await db.Users.AnyAsync(item => item.Username == username))
    {
        username = $"{baseUsername}{suffix}";
        suffix++;
    }

    return username;
}

static (string Salt, string Hash) HashPassword(string password)
{
    var saltBytes = RandomNumberGenerator.GetBytes(16);
    var hashBytes = Rfc2898DeriveBytes.Pbkdf2(password, saltBytes, 100_000, HashAlgorithmName.SHA256, 32);
    return (Convert.ToBase64String(saltBytes), Convert.ToBase64String(hashBytes));
}

static bool VerifyPassword(string password, string salt, string hash)
{
    var saltBytes = Convert.FromBase64String(salt);
    var expected = Convert.FromBase64String(hash);
    var actual = Rfc2898DeriveBytes.Pbkdf2(password, saltBytes, 100_000, HashAlgorithmName.SHA256, 32);
    return CryptographicOperations.FixedTimeEquals(actual, expected);
}

static string CreateJwt(AppUser user, string secret)
{
    var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    var header = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new { alg = "HS256", typ = "JWT" }));
    var payload = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new
    {
        sub = user.Id,
        name = user.Username,
        role = user.Role,
        teamId = user.TeamId,
        iat = now,
        exp = now + 60 * 60 * 12
    }));
    var signature = Sign($"{header}.{payload}", secret);
    return $"{header}.{payload}.{signature}";
}

static Actor? ReadActor(HttpContext httpContext, string secret)
{
    var header = httpContext.Request.Headers.Authorization.ToString();
    if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
    {
        return null;
    }

    var parts = header["Bearer ".Length..].Trim().Split('.');
    if (parts.Length != 3 || !FixedTimeEquals(Sign($"{parts[0]}.{parts[1]}", secret), parts[2]))
    {
        return null;
    }

    using var document = JsonDocument.Parse(Base64UrlDecode(parts[1]));
    var root = document.RootElement;
    var exp = root.GetProperty("exp").GetInt64();
    if (exp < DateTimeOffset.UtcNow.ToUnixTimeSeconds())
    {
        return null;
    }

    return new Actor(
        root.GetProperty("sub").GetInt32(),
        root.GetProperty("name").GetString() ?? string.Empty,
        root.GetProperty("role").GetString() ?? string.Empty,
        root.TryGetProperty("teamId", out var teamIdProperty) && teamIdProperty.ValueKind != JsonValueKind.Null
            ? teamIdProperty.GetInt32()
            : null);
}

static string Sign(string input, string secret)
{
    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
    return Base64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes(input)));
}

static bool FixedTimeEquals(string left, string right)
{
    var leftBytes = Encoding.UTF8.GetBytes(left);
    var rightBytes = Encoding.UTF8.GetBytes(right);
    return leftBytes.Length == rightBytes.Length && CryptographicOperations.FixedTimeEquals(leftBytes, rightBytes);
}

static string Base64Url(byte[] bytes) =>
    Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

static byte[] Base64UrlDecode(string value)
{
    var padded = value.Replace('-', '+').Replace('_', '/');
    padded += (padded.Length % 4) switch { 2 => "==", 3 => "=", _ => string.Empty };
    return Convert.FromBase64String(padded);
}

static string ResolveConnectionString(IConfiguration configuration)
{
    var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
    var configured = configuration.GetConnectionString("Default");
    var raw = CleanConnectionString(string.IsNullOrWhiteSpace(databaseUrl) ? configured : databaseUrl);
    if (string.IsNullOrWhiteSpace(raw))
    {
        return "Data Source=big6mid6.db";
    }

    return raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
        || raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase)
        ? ConvertDatabaseUrl(raw)
        : raw;
}

static string CleanConnectionString(string? value)
{
    var raw = (value ?? string.Empty).Trim().Trim('"', '\'');
    const string envPrefix = "DATABASE_URL=";
    if (raw.StartsWith(envPrefix, StringComparison.OrdinalIgnoreCase))
    {
        raw = raw[envPrefix.Length..].Trim().Trim('"', '\'');
    }

    return raw;
}

static bool IsPostgresConnectionString(string connectionString) =>
    connectionString.StartsWith("Host=", StringComparison.OrdinalIgnoreCase)
    || connectionString.StartsWith("Server=", StringComparison.OrdinalIgnoreCase);

static string ConvertDatabaseUrl(string databaseUrl)
{
    var uri = new Uri(databaseUrl);
    var userInfo = uri.UserInfo.Split(':', 2);
    var query = ParseQuery(uri.Query);
    var builder = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Database = uri.AbsolutePath.TrimStart('/'),
        Username = Uri.UnescapeDataString(userInfo.ElementAtOrDefault(0) ?? string.Empty),
        Password = Uri.UnescapeDataString(userInfo.ElementAtOrDefault(1) ?? string.Empty),
        SslMode = ResolveSslMode(query),
        ChannelBinding = ResolveChannelBinding(query)
    };
    return builder.ConnectionString;
}

static Dictionary<string, string> ParseQuery(string query) =>
    query.TrimStart('?')
        .Split('&', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Select(part => part.Split('=', 2))
        .Where(parts => parts.Length == 2)
        .ToDictionary(
            parts => Uri.UnescapeDataString(parts[0]).Replace("_", string.Empty, StringComparison.OrdinalIgnoreCase),
            parts => Uri.UnescapeDataString(parts[1]),
            StringComparer.OrdinalIgnoreCase);

static SslMode ResolveSslMode(IReadOnlyDictionary<string, string> query) =>
    query.TryGetValue("sslmode", out var sslMode) && Enum.TryParse<SslMode>(sslMode, true, out var parsed)
        ? parsed
        : SslMode.Require;

static ChannelBinding ResolveChannelBinding(IReadOnlyDictionary<string, string> query) =>
    query.TryGetValue("channelbinding", out var channelBinding) && Enum.TryParse<ChannelBinding>(channelBinding, true, out var parsed)
        ? parsed
        : ChannelBinding.Prefer;

static string[] ResolveAllowedOrigins(IConfiguration configuration) =>
    (Environment.GetEnvironmentVariable("ALLOWED_ORIGINS") ?? configuration["AllowedOrigins"] ?? string.Empty)
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Where(origin => Uri.TryCreate(origin, UriKind.Absolute, out _))
        .ToArray();

static bool IsAllowedOrigin(string origin, IReadOnlyCollection<string> allowedOrigins) =>
    allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)
    || Uri.TryCreate(origin, UriKind.Absolute, out var uri)
    && uri.Scheme == Uri.UriSchemeHttps
    && uri.Host.EndsWith(".vercel.app", StringComparison.OrdinalIgnoreCase);

public sealed record LoginRequest(string Username, string Password);
public sealed record ScoreRequest(int GrossScore, bool Confirmed);
public sealed record TournamentStatusRequest(string Status, bool IsClosed);
public sealed record AdminTournamentRequest(string Name, string CourseName, DateTimeOffset StartsAt, string Format, string StartMode, string Status, bool IsClosed, string Theme, HoleRequest[] Holes);
public sealed record HoleRequest(int Number, int Par);
public sealed record PodiumRequest(int? FirstTeamId, int? SecondTeamId, int? ThirdTeamId, decimal FirstPrize, decimal SecondPrize, decimal ThirdPrize);
public sealed record AdminTeamRequest(string TournamentSlug, string Name, int StartingHole, string[] Participants, string? JudgeName);
public sealed record AdminTeamUpdateRequest(string Name, int StartingHole, string[] Participants, string? JudgeName);
public sealed record TeamCountRequest(int Count);
public sealed record ResetPasswordRequest(string Username, string? NewPassword);
public sealed record LeaderboardRow(int TeamId, string TeamName, int TotalScore, int RelativeToPar, int HolesCompleted, DateTimeOffset LastUpdated, int CurrentHole)
{
    public int Position { get; init; }
}
public sealed record CachedLeaderboard(DateTimeOffset CachedAt, object Payload);
public sealed record Actor(int UserId, string Username, string Role, int? TeamId)
{
    public bool IsAdmin => Role.Equals("Admin", StringComparison.OrdinalIgnoreCase);
}
