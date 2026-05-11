namespace TourVirtual.Api.Models;

public sealed class AppStateRecord
{
    public int Id { get; set; }
    public string Key { get; set; } = "default";
    public string Json { get; set; } = "{}";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
