using System.Text.Json;
using Orbit.Application.Profile.Models;
using Orbit.Domain.ValueObjects;

var instant = new DateTime(2026, 10, 24, 12, 0, 0, DateTimeKind.Utc);
var day = DateOnly.FromDateTime(instant);
var id = Guid.Parse("22222222-2222-4222-8222-222222222222");
var snapshot = new UserDataExport(instant,
    new ExportedAccount("Eval account", "eval@example.invalid", instant, "pro"),
    new ExportedSettings("UTC", "en", 1, null, null, true, true, null, true),
    new ExportedSubscription("Pro", false, null, null, null, null),
    [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], null, [], [], []);
var habit = new ExportedHabit(id, "Water", null, null, false, false, day, null, "Day", 1,
    [], [new ChecklistItem("Fill glass", false)], instant,
    [new ExportedHabitLog(day, 1, null, instant)], null);
var goal = new ExportedGoal(id, "Read", null, 10, 0, "pages", "Active", "Standard", null,
    instant, null, []);
var tag = new ExportedTag(id, "Health", "#22c55e", instant);
var checklistTemplate = new ExportedChecklistTemplate(id, "Reading", ["Open book"], instant);
var options = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true };
File.WriteAllText(args[0], JsonSerializer.Serialize(new { apiCommit = args[1], snapshot, habit, goal, tag, checklistTemplate }, options) + "\n");
