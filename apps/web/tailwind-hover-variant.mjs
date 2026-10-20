import plugin from 'tailwindcss/plugin'

export default plugin(({ addVariant }) => {
  addVariant('hover', { '@media (hover: hover) and (pointer: fine)': { '&:hover': '@slot' } })
})
