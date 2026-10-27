using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Orbit.Application.Chat.Commands;
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

// Capture the real composition request before any provider, account or persistence call.
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
var context = Activator.CreateInstance(contextType, new object?[] {
    Array.Empty<Habit>(), new List<Habit>(), new List<Habit>(), new List<Habit>(), false, null, true,
    Array.Empty<Goal>(), Array.Empty<Tag>(), Array.Empty<string>(), new[] { FeatureFlagKeys.AstraBlockFirst },
    DateOnly.MinValue, facts, 0L });
var state = Activator.CreateInstance(handlerType.GetNestedType("ChatTurnState", BindingFlags.NonPublic)!, nonPublic: true);
var request = new ProcessUserChatCommand(Guid.Empty, "", ClientContext: new AgentClientContext(SupportsParts: true));
var method = handlerType.GetMethod("RequestInitialAiResponseAsync", BindingFlags.NonPublic | BindingFlags.Instance)!;
await (Task<Result<AiResponse>>)method.Invoke(handler, [request, context, null, new AiTurnTelemetry(), state, CancellationToken.None])!;
if (captured is null) throw new InvalidOperationException("The API did not build a tool request.");
// Export the SDK tools built by AiIntentService, including its StrictToolSchema normalization.
var sdkCatalog = (System.Collections.IDictionary)typeof(AiIntentService)
    .GetMethod("BuildToolCatalog", BindingFlags.NonPublic | BindingFlags.Static)!.Invoke(null, [captured.ToolDeclarations])!;
var tools = sdkCatalog.Keys.Cast<string>().Select(key =>
{
    var sdk = sdkCatalog[key]!;
    var name = (string)Property(sdk, "FunctionName")!;
    using var parameters = JsonDocument.Parse(((BinaryData)Property(sdk, "FunctionParameters")!).ToString());
    return new { type = "function", writes = !registry.GetTool(name)!.IsReadOnly,
        function = new { name, description = (string?)Property(sdk, "FunctionDescription"),
            strict = (bool?)Property(sdk, "StrictModeEnabled"), parameters = parameters.RootElement.Clone() } };
}).ToArray();
File.WriteAllText(args[0], JsonSerializer.Serialize(tools));

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
