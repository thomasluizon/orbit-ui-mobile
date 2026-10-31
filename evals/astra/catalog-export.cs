using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Orbit.Application.Chat.Commands;
using Orbit.Application.Chat.Models;
using Orbit.Application.Common;
using Orbit.Application.Chat.Tools;
using Orbit.Domain.Common;
using Orbit.Domain.Entities;
using Orbit.Domain.Interfaces;
using Orbit.Domain.Models;
using Orbit.Infrastructure.Services;

// Use the API registrations and registry so chat-only and MCP-only selection stays producer-owned.
var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = [] });
var registration = typeof(Orbit.Api.Extensions.ServiceCollectionExtensions);
foreach (var name in new[] { "AddAiPlatformServices", "AddAiChatTools" })
    registration.GetMethod(name, BindingFlags.NonPublic | BindingFlags.Static)!.Invoke(null, [builder]);
var construction = new ToolConstruction();
var registry = new AiToolRegistry(builder.Services.Where(service => service.ServiceType == typeof(IAiTool))
    .Select(service => (IAiTool)(service.ImplementationType is { } type
        ? construction.GetService(type) : service.ImplementationFactory!(construction))!));

// Capture each real request context before any provider, account or persistence call.
AiToolRequest? captured = null;
var intent = Boundary<IAiIntentService>.Create((method, arguments) =>
{
    if (method.Name != "SendWithToolsAsync") throw new InvalidOperationException(method.Name);
    captured = (AiToolRequest)arguments![0]!;
    return Task.FromResult(Result.Success(new AiResponse()));
});
var prompts = Boundary<ISystemPromptBuilder>.Create((method, _) => method.Name is "BuildStatic" or "BuildDynamic"
    ? "" : throw new InvalidOperationException(method.Name));
var catalog = Boundary<IAgentCatalogService>.Create((method, _) => method.Name is "BuildStaticSupplement" or "BuildDynamicSupplement"
    ? "" : throw new InvalidOperationException(method.Name));
var pending = Boundary<IPendingAgentOperationStore>.Create((method, _) => method.Name == "GetAwaiting"
    ? Array.Empty<PendingAgentOperationExecution>() : throw new InvalidOperationException(method.Name));
var payGate = Boundary<IPayGateService>.Create((method, _) => method.Name == "TryConsumeAiMessage"
    ? Task.FromResult(Result.Success()) : throw new InvalidOperationException(method.Name));
var previewer = Boundary<IPendingOperationChangePreviewer>.Create((method, _) => throw new InvalidOperationException(method.Name));
var execution = new ChatExecutionDependencies(null!, null!, payGate, null!, null!, null!, null!, null!,
    null!, null!, null!, null!, null!, pending, previewer);
var handler = new ProcessUserChatCommandHandler(null!, new(intent, registry, prompts, catalog), execution,
    NullLogger<ProcessUserChatCommandHandler>.Instance, null!, null!);
var handlerType = typeof(ProcessUserChatCommandHandler);
var factsType = handlerType.Assembly.GetType("Orbit.Application.Chat.HabitTodaySnapshot", true)!;
var facts = Activator.CreateInstance(factsType, new object?[] { new HashSet<Guid>(), new HashSet<Guid>(), new HashSet<Guid>(), null });
var contextType = handlerType.GetNestedType("ChatContext", BindingFlags.NonPublic)!;
var context = CatalogConstructor.Create(contextType, new Dictionary<string, object?>(StringComparer.Ordinal) {
    ["UserHabits"] = Array.Empty<Habit>(),
    ["ActiveHabits"] = new List<Habit>(),
    ["PromptHabits"] = new List<Habit>(),
    ["IsPromptHabitIndexPartial"] = false,
    ["User"] = null,
    ["Language"] = null,
    ["HasProAccess"] = true,
    ["ActiveGoals"] = Array.Empty<Goal>(),
    ["UserTags"] = Array.Empty<Tag>(),
    ["ChecklistTemplateNames"] = Array.Empty<string>(),
    ["EnabledFeatureFlags"] = new[] { FeatureFlagKeys.AstraBlockFirst },
    ["UserToday"] = DateOnly.MinValue,
    ["TodayFacts"] = facts,
    ["ContextLoadMilliseconds"] = 0L });
var method = handlerType.GetMethod("RequestInitialAiResponseAsync", BindingFlags.NonPublic | BindingFlags.Instance)!;
var collectSensitiveFields = handlerType.GetNestedType("ChatEvalTraceCollector", BindingFlags.NonPublic)!
    .GetMethod("CollectSensitiveFields", BindingFlags.NonPublic | BindingFlags.Static)!;
var partKinds = JsonSerializer.Deserialize<string[]>(args[1])!;
var habitSetupBinding = new { draftCallId = "__draft_call_id__", missingField = "__missing_field__" };
File.WriteAllText(args[0], JsonSerializer.Serialize(new {
    offerTools = await ExportTools(true, offers: true),
    offerPostReadTools = await ExportTools(true, afterAccountRead: true, offers: true),
    tools = await ExportTools(true), legacyTools = await ExportTools(false),
    postReadTools = await ExportTools(true, afterAccountRead: true), habitSetupBinding,
    habitSetupTools = await ExportTools(true, draft: new HabitSetupDraft(
        habitSetupBinding.draftCallId, "New habit draft", habitSetupBinding.missingField, Guid.Empty)) }));

async Task<object[]> ExportTools(bool supportsParts, bool afterAccountRead = false, HabitSetupDraft? draft = null, bool offers = false)
{
    captured = null;
    var state = Activator.CreateInstance(handlerType.GetNestedType("ChatTurnState", BindingFlags.NonPublic)!, nonPublic: true);
    var request = new ProcessUserChatCommand(Guid.Empty, "", ClientContext: new AgentClientContext(
        SupportsParts: supportsParts, PartKinds: supportsParts ? partKinds : null,
        SupportsPendingOperationChanges: offers, SupportsProactiveOffers: offers,
        ConversationId: offers ? Guid.Parse("11111111-1111-4111-8111-111111111111") : null));
    await (Task<Result<AiResponse>>)method.Invoke(handler, [request, context, null, new AiTurnTelemetry(), state, CancellationToken.None])!;
    if (captured is null) throw new InvalidOperationException("The API did not build a tool request.");
    var declarations = captured.ToolDeclarations;
    if (afterAccountRead || draft is not null)
    {
        // Use ProcessUserChatCommand.Ask.cs:185-197's continuation declaration builder for both prerequisites.
        var resultsType = handlerType.GetNestedType("ToolExecutionAccumulator", BindingFlags.NonPublic)!;
        var results = Activator.CreateInstance(resultsType, nonPublic: true)!;
        resultsType.GetProperty("HasSuccessfulAccountRead")!.SetValue(results, afterAccountRead);
        if (draft is not null)
            ((IDictionary<string, HabitSetupDraft>)resultsType.GetProperty("MissingHabitDrafts")!.GetValue(results)!)
                .Add(draft.CallId, draft);
        var conversation = new AiConversationContext();
        handlerType.GetMethod("RefreshAskSchema", BindingFlags.NonPublic | BindingFlags.Instance)!
            .Invoke(handler, [conversation, request, context, results]);
        declarations = conversation.ToolDeclarationUpdates;
        if (declarations.Count == 0) throw new InvalidOperationException("The API did not refresh its tool declarations.");
    }
    // Export SDK normalization and the trace collector's sensitivity contract from the same producer.
    var sdkCatalog = (System.Collections.IDictionary)typeof(AiIntentService)
        .GetMethod("BuildToolCatalog", BindingFlags.NonPublic | BindingFlags.Static)!.Invoke(null, [declarations])!;
    return sdkCatalog.Keys.Cast<string>().Select(key =>
    {
        var sdk = sdkCatalog[key]!;
        var name = (string)Property(sdk, "FunctionName")!;
        var tool = registry.GetTool(name)!;
        var sensitiveFields = new HashSet<string>(StringComparer.Ordinal);
        collectSensitiveFields.Invoke(null, [JsonSerializer.SerializeToElement(tool.GetParameterSchema()), sensitiveFields]);
        if (tool.GetResultSchema() is { } resultSchema)
            collectSensitiveFields.Invoke(null, [JsonSerializer.SerializeToElement(resultSchema), sensitiveFields]);
        using var parameters = JsonDocument.Parse(((BinaryData)Property(sdk, "FunctionParameters")!).ToString());
        return (object)new { type = "function", writes = !tool.IsReadOnly,
            sensitiveFields = sensitiveFields.Order(StringComparer.Ordinal).ToArray(),
            function = new { name, description = (string?)Property(sdk, "FunctionDescription"),
                strict = (bool?)Property(sdk, "StrictModeEnabled"), parameters = parameters.RootElement.Clone() } };
    }).ToArray();
}

static object? Property(object instance, string name) => instance.GetType().GetProperty(name)!.GetValue(instance);

public class Boundary<T> : DispatchProxy where T : class
{
    public Func<MethodInfo, object?[]?, object?> InvokeBoundary = null!;
    public static T Create(Func<MethodInfo, object?[]?, object?> callback)
    {
        var proxy = Create<T, Boundary<T>>();
        ((Boundary<T>)(object)proxy).InvokeBoundary = callback;
        return proxy;
    }
    protected override object? Invoke(MethodInfo? method, object?[]? arguments) => InvokeBoundary(method!, arguments);
}

public sealed class ToolConstruction : IServiceProvider
{
    public object GetService(Type type)
    {
        if (!typeof(IAiTool).IsAssignableFrom(type)) throw new InvalidOperationException(type.FullName);
        var constructor = type.GetConstructors().Single();
        return constructor.Invoke(constructor.GetParameters().Select(parameter =>
            typeof(IAiTool).IsAssignableFrom(parameter.ParameterType) ? GetService(parameter.ParameterType) : null).ToArray());
    }
}
