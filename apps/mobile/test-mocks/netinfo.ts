const NetInfo = {
  addEventListener: (_listener: (state: { isConnected: boolean | null }) => void) => {
    return () => {}
  },
  fetch: () => Promise.resolve({ isConnected: true }),
}

export default NetInfo
