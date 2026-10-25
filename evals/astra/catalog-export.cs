using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using Orbit.Application.Chat.Tools;
using Orbit.Application.Chat.Tools.Implementations;
using Orbit.Infrastructure.AI;

var tools = typeof(IAiTool).Assembly.GetTypes()
    .Where(type => type.IsClass && !type.IsAbstract && typeof(IAiTool).IsAssignableFrom(type)
        && !typeof(IMcpOnlyAiTool).IsAssignableFrom(type))
    .Select(type => type == typeof(AskTool)
        ? new AskTool(Uninitialized<BulkCreateHabitsTool>(), Uninitialized<BulkLogHabitsTool>(),
            Uninitialized<BulkSkipHabitsTool>(), null!)
        : (IAiTool)RuntimeHelpers.GetUninitializedObject(type))
    .OrderBy(tool => tool.Name, StringComparer.Ordinal)
    .Select(tool =>
    {
        var original = JsonSerializer.SerializeToNode(tool.GetParameterSchema())!.AsObject();
        var normalized = JsonNode.Parse(StrictToolSchema.Create(original.ToJsonString()).ToString())!.AsObject();
        RestoreOptionalFields(original, normalized);
        return new { type = "function", writes = !tool.IsReadOnly,
            function = new { name = tool.Name, parameters = normalized } };
    }).ToArray();
File.WriteAllText(args[0], JsonSerializer.Serialize(tools));

static T Uninitialized<T>() => (T)RuntimeHelpers.GetUninitializedObject(typeof(T));

static void RestoreOptionalFields(JsonObject original, JsonObject normalized)
{
    normalized.Remove("description");
    foreach (var (name, value) in original)
        if (!normalized.ContainsKey(name) && name is not ("description" or "nullable" or "sensitive"))
            normalized[name] = value?.DeepClone();
    if (original["properties"] is JsonObject properties)
    {
        normalized["required"] = original["required"]?.DeepClone() ?? new JsonArray();
        foreach (var (name, value) in properties)
            RestoreOptionalFields(value!.AsObject(), normalized["properties"]![name]!.AsObject());
    }
    if (original["items"] is JsonObject items)
        RestoreOptionalFields(items, normalized["items"]!.AsObject());
    if (original["anyOf"] is JsonArray alternatives)
        for (var index = 0; index < alternatives.Count; index++)
            RestoreOptionalFields(alternatives[index]!.AsObject(), normalized["anyOf"]![index]!.AsObject());
}
