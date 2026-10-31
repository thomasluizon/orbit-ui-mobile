import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ListMotionItem, ListPresence } from '@/components/motion/list-motion'
import { useHabitListScrollAnchor } from '@/hooks/use-habit-list-scroll-anchor'

function Fixture() {
  const [count, setCount] = useState(200)
  const anchor = useHabitListScrollAnchor()
  return <>
    <button onClick={() => setCount(20)}>Remove rows</button>
    <div data-shell-scroller="" style={{ height: 600, overflowY: 'auto', paddingBottom: 96, boxSizing: 'border-box' }}>
      <div style={{ height: 80 }} />
      <div ref={anchor} data-habit-list="" style={{ overflowAnchor: 'none' }}>
        <ListPresence>{Array.from({ length: count }, (_, index) => <ListMotionItem key={index}>
          <div data-row={index} style={{ height: 56 }}>{index}</div>
        </ListMotionItem>)}</ListPresence>
      </div>
      <div data-footer="" style={{ height: 80 }}>Footer</div>
    </div>
  </>
}

createRoot(document.getElementById('root')!).render(<Fixture />)
