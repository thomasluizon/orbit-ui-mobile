declare module 'i18next-icu/cjs' {
  import ICU from 'i18next-icu'

  const ICUCommonJs: typeof ICU | { default: typeof ICU }
  export default ICUCommonJs
}
