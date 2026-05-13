using Microsoft.EntityFrameworkCore;
using TourVirtual.Api.Models;

namespace TourVirtual.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Tournament> Tournaments => Set<Tournament>();
    public DbSet<PodiumSetting> PodiumSettings => Set<PodiumSetting>();
    public DbSet<Hole> Holes => Set<Hole>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<ScoreEntry> Scores => Set<ScoreEntry>();
    public DbSet<ScoreAuditLog> ScoreAuditLogs => Set<ScoreAuditLog>();
    public DbSet<AppUser> Users => Set<AppUser>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Tournament>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.Slug).IsUnique();
            entity.Property(item => item.Slug).HasMaxLength(32);
            entity.Property(item => item.Name).HasMaxLength(80);
            entity.Property(item => item.CourseName).HasMaxLength(120);
            entity.Property(item => item.Format).HasMaxLength(40);
            entity.Property(item => item.StartMode).HasMaxLength(40);
            entity.Property(item => item.Status).HasMaxLength(24);
            entity.Property(item => item.Theme).HasMaxLength(24);
        });

        modelBuilder.Entity<PodiumSetting>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.TournamentId).IsUnique();
            entity.HasOne(item => item.Tournament)
                .WithOne(item => item.PodiumSetting)
                .HasForeignKey<PodiumSetting>(item => item.TournamentId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.Property(item => item.FirstPrize).HasColumnType("decimal(12,2)");
            entity.Property(item => item.SecondPrize).HasColumnType("decimal(12,2)");
            entity.Property(item => item.ThirdPrize).HasColumnType("decimal(12,2)");
        });

        modelBuilder.Entity<Hole>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.TournamentId, item.Number }).IsUnique();
        });

        modelBuilder.Entity<Team>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Name).HasMaxLength(120);
            entity.Property(item => item.Participants).HasMaxLength(720);
        });

        modelBuilder.Entity<ScoreEntry>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.TeamId, item.HoleNumber }).IsUnique();
        });

        modelBuilder.Entity<ScoreAuditLog>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.Property(item => item.ChangedBy).HasMaxLength(80);
            entity.Property(item => item.Role).HasMaxLength(24);
        });

        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.Username).IsUnique();
            entity.Property(item => item.Username).HasMaxLength(80);
            entity.Property(item => item.Role).HasMaxLength(24);
        });
    }
}
