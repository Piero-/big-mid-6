using Microsoft.EntityFrameworkCore;
using TourVirtual.Api.Models;

namespace TourVirtual.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AppStateRecord> AppStates => Set<AppStateRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppStateRecord>(entity =>
        {
            entity.HasKey(record => record.Id);
            entity.HasIndex(record => record.Key).IsUnique();
            entity.Property(record => record.Key).HasMaxLength(64);
            entity.Property(record => record.Json).IsRequired();
        });
    }
}
