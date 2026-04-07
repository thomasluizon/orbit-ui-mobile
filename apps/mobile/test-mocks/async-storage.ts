const AsyncStorage = {
  getItem: async (_key: string) => null,
  setItem: async (_key: string, _value: string) => {},
  removeItem: async (_key: string) => {},
  clear: async () => {},
  multiGet: async (_keys: string[]) => [],
  multiSet: async (_entries: Array<[string, string]>) => {},
  multiRemove: async (_keys: string[]) => {},
}

export default AsyncStorage
