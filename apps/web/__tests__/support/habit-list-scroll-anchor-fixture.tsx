import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ListMotionItem, ListPresence } from '@/components/motion/list-motion'
import { useHabitListScrollAnchor } from '@/hooks/use-habit-list-scroll-anchor'

function Fixture() {
  const root = document.getElementById('root')!
  const [count, setCount] = useState(Number(root.dataset.count ?? 200))
  const [height, setHeight] = useState(600)
  const anchor = useHabitListScrollAnchor()
  return <>
    <button onClick={() => setCount(Number(root.dataset.remaining ?? 20))}>Remove rows</button>
    <button id="grow-viewport" onClick={() => setHeight(832)}>Grow viewport</button>
    <div data-shell-scroller="" style={{ position: 'relative', height, overflowY: 'auto', paddingBottom: 96, boxSizing: 'border-box' }}>
      <div data-shell-page-content="" style={{ minHeight: '100%' }}>
        <div style={{ height: 80 }} />
        <div ref={anchor} data-habit-list="" style={{ overflowAnchor: 'none' }}>
          <ListPresence>{Array.from({ length: count }, (_, index) => <ListMotionItem key={index}>
            <div data-row={index} style={{ height: 56 }}>{index}</div>
          </ListMotionItem>)}</ListPresence>
        </div>
        <div data-footer="" style={{ height: 80 }}>Footer</div>
      </div>
    </div>
  </>
}

createRoot(document.getElementById('root')!).render(<Fixture />)
