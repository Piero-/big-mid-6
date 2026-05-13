namespace TourVirtual.Api.Models;

public sealed class Tournament
{
    public int Id { get; set; }
    public string Slug { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string CourseName { get; set; } = "La Cana Beach & Golf Club";
    public DateTimeOffset StartsAt { get; set; }
    public string Format { get; set; } = "scramble";
    public string StartMode { get; set; } = "shotgun";
    public string Status { get; set; } = "upcoming";
    public bool IsClosed { get; set; }
    public string Theme { get; set; } = "oscuro";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<Hole> Holes { get; set; } = [];
    public List<Team> Teams { get; set; } = [];
    public PodiumSetting? PodiumSetting { get; set; }
}

public sealed class PodiumSetting
{
    public int Id { get; set; }
    public int TournamentId { get; set; }
    public Tournament? Tournament { get; set; }
    public int? FirstTeamId { get; set; }
    public int? SecondTeamId { get; set; }
    public int? ThirdTeamId { get; set; }
    public decimal FirstPrize { get; set; }
    public decimal SecondPrize { get; set; }
    public decimal ThirdPrize { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Hole
{
    public int Id { get; set; }
    public int TournamentId { get; set; }
    public Tournament? Tournament { get; set; }
    public int Number { get; set; }
    public int Par { get; set; }
}

public sealed class Team
{
    public int Id { get; set; }
    public int TournamentId { get; set; }
    public Tournament? Tournament { get; set; }
    public string Name { get; set; } = string.Empty;
    public int StartingHole { get; set; } = 1;
    public string Participants { get; set; } = string.Empty;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<ScoreEntry> Scores { get; set; } = [];
    public List<AppUser> Users { get; set; } = [];
}

public sealed class ScoreEntry
{
    public int Id { get; set; }
    public int TeamId { get; set; }
    public Team? Team { get; set; }
    public int HoleNumber { get; set; }
    public int GrossScore { get; set; }
    public bool Confirmed { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class ScoreAuditLog
{
    public int Id { get; set; }
    public int TournamentId { get; set; }
    public int TeamId { get; set; }
    public int HoleNumber { get; set; }
    public int? PreviousScore { get; set; }
    public int NewScore { get; set; }
    public string ChangedBy { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public DateTimeOffset ChangedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AppUser
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string PasswordSalt { get; set; } = string.Empty;
    public string Role { get; set; } = "Team";
    public int? TeamId { get; set; }
    public Team? Team { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
