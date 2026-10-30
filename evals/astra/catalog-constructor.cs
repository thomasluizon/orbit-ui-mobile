public static class CatalogConstructor
{
    public static object Create(Type contextType, IReadOnlyDictionary<string, object?> values)
    {
        var constructor = contextType.GetConstructors().Single();
        var parameters = constructor.GetParameters();
        var unknown = parameters.Where(parameter => !values.ContainsKey(parameter.Name!))
            .Select(parameter => parameter.Name).ToArray();
        if (unknown.Length > 0)
            throw new InvalidOperationException(
                $"Catalog export has no value for {contextType.Name} constructor parameters: {string.Join(", ", unknown)}.");
        return constructor.Invoke(parameters.Select(parameter => values[parameter.Name!]).ToArray());
    }
}
