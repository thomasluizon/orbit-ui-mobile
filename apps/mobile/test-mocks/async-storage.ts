const AsyncStorage = {
  getItem: (_key: string) => Promise.resolve(null),
  setItem: async (_key: string, _value: string) => {},
  removeItem: async (_key: string) => {},
  clear: async () => {},
  multiGet: (_keys: string[]) => Promise.resolve([]),
  multiSet: async (_entries: [string, string][]) => {},
  multiRemove: async (_keys: string[]) => {},
}

export default AsyncStorage
