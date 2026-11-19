/** Text with each name Orbit in it marked `translate="no"`: a page translator keeps the name and translates the rest (DESIGN.md). */
export function OrbitNameText({ text }: Readonly<{ text: string }>) {
  return <>{text.split(/(Orbit)/).map((part, index) => part === 'Orbit' ? <span key={index} translate="no">{part}</span> : part)}</>
}
