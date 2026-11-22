using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Orbit.Application.Chat;
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
var intent = new CapturingIntentService();
var execution = new ChatExecutionDependencies(null!, null!, new AiMessagePayGate(), null!, null!, null!, null!, null!,
    null!, null!, null!, null!, null!, new EmptyPendingOperationStore(), new RefusedChangePreviewer());
var handler = new ProcessUserChatCommandHandler(null!, new(intent, registry, new EmptySystemPrompt(), new EmptyAgentCatalog()),
    execution, NullLogger<ProcessUserChatCommandHandler>.Instance, null!, null!);
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
    ["EnabledFeatureFlags"] = new[] { FeatureFlagKeys.AiBlockFirst },
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
    offerHabitSetupTools = await ExportTools(true, draft: new HabitSetupDraft(
        habitSetupBinding.draftCallId, "New habit draft", habitSetupBinding.missingField, Guid.Empty), offers: true),
    tools = await ExportTools(true), legacyTools = await ExportTools(false),
    postReadTools = await ExportTools(true, afterAccountRead: true), habitSetupBinding,
    habitSetupTools = await ExportTools(true, draft: new HabitSetupDraft(
        habitSetupBinding.draftCallId, "New habit draft", habitSetupBinding.missingField, Guid.Empty)) }));

async Task<object[]> ExportTools(bool supportsParts, bool afterAccountRead = false, HabitSetupDraft? draft = null, bool offers = false)
{
    intent.Captured = null;
    var state = Activator.CreateInstance(handlerType.GetNestedType("ChatTurnState", BindingFlags.NonPublic)!, nonPublic: true);
    var request = new ProcessUserChatCommand(Guid.Empty, "", ClientContext: new AgentClientContext(
        SupportsParts: supportsParts, PartKinds: supportsParts ? partKinds : null,
        SupportsPendingOperationChanges: offers, SupportsProactiveOffers: offers,
        ConversationId: offers ? Guid.Parse("11111111-1111-4111-8111-111111111111") : null));
    await (Task<Result<AiResponse>>)method.Invoke(handler, [request, context, null, new AiTurnTelemetry(), state, CancellationToken.None])!;
    if (intent.Captured is null) throw new InvalidOperationException("The API did not build a tool request.");
    var declarations = intent.Captured.ToolDeclarations;
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
        var tool = registry.GetTool(name);
        // ProcessUserChatCommand.Plans.cs:15-16 removes the producer-owned plan before account actions.
        if (tool is null && name != PlanToolDeclaration.Name)
            throw new InvalidOperationException($"No registry metadata for tool declaration '{name}'.");
        var sensitiveFields = new HashSet<string>(StringComparer.Ordinal);
        // ProcessUserChatCommand.EvalTrace.cs:17-28 collects schema sensitivity only for registered tools.
        if (tool is not null)
        {
            collectSensitiveFields.Invoke(null, [JsonSerializer.SerializeToElement(tool.GetParameterSchema()), sensitiveFields]);
            if (tool.GetResultSchema() is { } resultSchema)
                collectSensitiveFields.Invoke(null, [JsonSerializer.SerializeToElement(resultSchema), sensitiveFields]);
        }
        using var parameters = JsonDocument.Parse(((BinaryData)Property(sdk, "FunctionParameters")!).ToString());
        return (object)new { type = "function", writes = tool is { IsReadOnly: false },
            sensitiveFields = sensitiveFields.Order(StringComparer.Ordinal).ToArray(),
            function = new { name, description = (string?)Property(sdk, "FunctionDescription"),
                strict = (bool?)Property(sdk, "StrictModeEnabled"), parameters = parameters.RootElement.Clone() } };
    }).ToArray();
}

static object? Property(object instance, string name) => instance.GetType().GetProperty(name)!.GetValue(instance);

// Each boundary implements its whole API interface, so a new interface member stops the build (CS0535) until this file
// answers it or refuses it. A refused member throws its own name if the export path reaches it.
static class Boundary
{
    public static InvalidOperationException Refused([CallerMemberName] string member = "") =>
        new($"The catalog export refuses {member}; answer it in evals/ai-eval/catalog-export.cs if the export path needs it.");
}

public sealed class CapturingIntentService : IAiIntentService
{
    public AiToolRequest? Captured { get; set; }
    public Task<Result<AiResponse>> SendWithToolsAsync(AiToolRequest request, Func<AiStreamEvent, Task>? streamSink,
        CancellationToken cancellationToken)
    {
        Captured = request;
        return Task.FromResult(Result.Success(new AiResponse()));
    }
    public Task<Result<AiResponse>> ContinueWithToolResultsAsync(AiConversationContext conversationContext,
        IReadOnlyList<AiToolCallResult> results, Func<AiStreamEvent, Task>? streamSink, CancellationToken cancellationToken) =>
        throw Boundary.Refused();
}

public sealed class EmptySystemPrompt : ISystemPromptBuilder
{
    public string BuildStatic(PromptBuildRequest request) => "";
    public string BuildDynamic(PromptBuildRequest request) => "";
    public string BuildAccountContext(PromptBuildRequest request) => "";
    public string BuildTurnContext(PromptBuildRequest request) => "";
}

public sealed class EmptyAgentCatalog : IAgentCatalogService
{
    public string BuildStaticSupplement() => "";
    public string BuildDynamicSupplement(AgentContextSnapshot snapshot) => "";
    public string BuildClientHints(AgentClientContext? client) => "";
    public IReadOnlyList<AgentCapability> GetCapabilities() => throw Boundary.Refused();
    public IReadOnlyList<AgentOperation> GetOperations() => throw Boundary.Refused();
    public IReadOnlyList<AppSurface> GetSurfaces() => throw Boundary.Refused();
    public IReadOnlyList<UserDataCatalogEntry> GetUserDataCatalog() => throw Boundary.Refused();
    public AgentCapability? GetCapability(string capabilityId) => throw Boundary.Refused();
    public AgentOperation? GetOperation(string operationId) => throw Boundary.Refused();
    public AgentCapability? GetCapabilityByChatTool(string toolName) => throw Boundary.Refused();
    public AgentCapability? GetCapabilityByMcpTool(string toolName) => throw Boundary.Refused();
    public bool HasEquivalentControllerAction(string actionKey) => throw Boundary.Refused();
}

public sealed class EmptyPendingOperationStore : IPendingAgentOperationStore
{
    public Task<IReadOnlyList<PendingAgentOperationPreview>> GetLastConversationPreviewsAsync(Guid userId,
        Guid conversationId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<PendingAgentOperationPreview>>([]);
    public IReadOnlyList<PendingAgentOperationExecution> GetAwaiting(Guid userId) => [];
    public Task<IReadOnlyList<PendingAgentOperationExecution>> GetAwaitingAsync(Guid userId,
        CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<PendingAgentOperationExecution>>([]);
    public Task<IReadOnlyList<Guid>> GetOpenIdsAsync(Guid userId, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<Guid>>([]);
    public PendingAgentOperation Create(Guid userId, AgentCapability capability, string operationId, string argumentsJson,
        string summary, string operationFingerprint, AgentExecutionSurface surface, PendingOperationConversation? conversation) =>
        throw Boundary.Refused();
    public PendingAgentOperationConfirmation? Confirm(Guid userId, Guid pendingOperationId) => throw Boundary.Refused();
    public PendingAgentOperationExecution? GetExecution(Guid userId, Guid pendingOperationId) => throw Boundary.Refused();
    public bool IsAwaitingConfirmation(Guid userId, Guid pendingOperationId) => throw Boundary.Refused();
    public IReadOnlyList<PendingHabitCreation> GetPendingHabitCreations(Guid userId) => throw Boundary.Refused();
    public IReadOnlyList<Guid>? FindHabitCreationReplacement(Guid userId, string title, Guid? parentHabitId) =>
        throw Boundary.Refused();
    public bool Revise(Guid userId, Guid pendingOperationId, string expectedFingerprint, string argumentsJson,
        string operationFingerprint, string previewFingerprint, PendingOperationChangePreview? revisedPreview) =>
        throw Boundary.Refused();
    public PendingAgentOperationRevision? GetRevision(Guid userId, Guid pendingOperationId) => throw Boundary.Refused();
    public bool Restore(Guid userId, Guid pendingOperationId, string expectedFingerprint,
        PendingAgentOperationRevision revision) => throw Boundary.Refused();
    public bool Cancel(Guid userId, Guid pendingOperationId, string expectedFingerprint) => throw Boundary.Refused();
    public bool Withdraw(Guid userId, Guid pendingOperationId, string expectedFingerprint,
        IReadOnlyCollection<Guid>? releasedMemberIds) => throw Boundary.Refused();
    public PendingAgentOperationExecution? GetConfirmedExecution(Guid userId, string capabilityId,
        string operationFingerprint, string confirmationToken) => throw Boundary.Refused();
    public bool TryConsumeFreshConfirmation(Guid userId, string capabilityId, string operationFingerprint,
        string confirmationToken, bool requireStepUp) => throw Boundary.Refused();
    public bool RecordExecution(Guid userId, Guid pendingOperationId, AgentOperationResult operation) =>
        throw Boundary.Refused();
}

public sealed class AiMessagePayGate : IPayGateService
{
    public Task<Result> TryConsumeAiMessage(Guid userId, IUnitOfWork unitOfWork, CancellationToken ct) =>
        Task.FromResult(Result.Success());
    public Task<Result> CanCreateHabits(Guid userId, int count, CancellationToken ct) => throw Boundary.Refused();
    public Task<Result> RefundAiMessage(Guid userId, DateOnly reservedDate, IUnitOfWork unitOfWork, CancellationToken ct) =>
        throw Boundary.Refused();
    public Task<Result> CanUseDailySummary(Guid userId, CancellationToken ct) => throw Boundary.Refused();
    public Task<Result> CanUseSmartReschedule(Guid userId, CancellationToken ct) => throw Boundary.Refused();
    public Task<Result> CanUseRetrospective(Guid userId, CancellationToken ct) => throw Boundary.Refused();
    public Task<Result> CanAccessCalendar(Guid userId, CancellationToken ct) => throw Boundary.Refused();
    public Task<Result> CanAccessNotion(Guid userId, CancellationToken ct) => throw Boundary.Refused();
    public Task<Result> CanManageCalendar(Guid userId, CancellationToken ct) => throw Boundary.Refused();
    public Task<int> GetAiMessageLimit(Guid userId, CancellationToken ct) => throw Boundary.Refused();
    public Task<Result> CanCreateApiKeys(Guid userId, CancellationToken ct) => throw Boundary.Refused();
    public Task<Result> CanReadApiKeys(Guid userId, CancellationToken ct) => throw Boundary.Refused();
    public Task<Result> CanManageApiKeys(Guid userId, CancellationToken ct) => throw Boundary.Refused();
    public Task<Result> CanManageAiSummary(Guid userId, CancellationToken ct) => throw Boundary.Refused();
    public Task<Result> CanManageProactiveAi(Guid userId, CancellationToken ct) => throw Boundary.Refused();
    public Task<Result> CanUseSlipAlerts(Guid userId, CancellationToken ct) => throw Boundary.Refused();
}

public sealed class RefusedChangePreviewer : IPendingOperationChangePreviewer
{
    public Task<Result<PendingOperationChangePreview?>> PreviewAsync(Guid userId, string operationId, JsonElement arguments,
        CancellationToken cancellationToken, AgentClientContext? clientContext) => throw Boundary.Refused();
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
