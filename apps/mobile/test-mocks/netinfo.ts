const NetInfo = {
  addEventListener: (_listener: (state: { isConnected: boolean | null }) => void) => {
    return () => {}
  },
  fetch: async () => ({ isConnected: true }),
}

export default NetInfo
