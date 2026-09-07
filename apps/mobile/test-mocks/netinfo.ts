const NetInfo = {
  addEventListener: (_listener: (state: { isConnected: boolean | null }) => void) => {
    return () => {}
  },
  fetch: () => ({ isConnected: true }),
}

export default NetInfo
