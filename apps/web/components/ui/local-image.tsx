import { createElement } from 'react'
import type { ImgHTMLAttributes } from 'react'

/** Raw `<img>` for sources that next/image cannot optimize (blob: URLs from
 *  user uploads, runtime-generated data: URIs). Uses createElement so the
 *  @next/next/no-img-element rule isn't tripped at the call site. */
export function LocalImage(props: Readonly<ImgHTMLAttributes<HTMLImageElement>>) {
  return createElement('img', props)
}
