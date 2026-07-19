import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const T = require('@tabler/icons-react')

const actual = JSON.parse(fs.readFileSync(new URL('./lucide-actual.json', import.meta.url)))
const TYPE_IMPORTS = new Set(['LucideIcon', 'LucideProps'])

// Lucide name -> Tabler name, only where 'Icon'+name is wrong/missing.
const SPECIAL = {
  CheckCheck: 'IconChecks',
  CheckCircle: 'IconCircleCheck', CheckCircle2: 'IconCircleCheck',
  XCircle: 'IconCircleX', X: 'IconX',
  CircleHelp: 'IconHelpCircle', HelpCircle: 'IconHelpCircle',
  Clock3: 'IconClock',
  Expand: 'IconMaximize',
  MessageSquare: 'IconMessage', MessageCircle: 'IconMessageCircle',
  Orbit: 'IconCircleDotted',
  PanelLeft: 'IconLayoutSidebarLeftExpand', PanelLeftClose: 'IconLayoutSidebarLeftCollapse', PanelRight: 'IconLayoutSidebarRight',
  SquarePen: 'IconPencil', SquarePencil: 'IconPencil', PencilLine: 'IconPencil',
  RotateCcw: 'IconRotate', RotateCw: 'IconRotateClockwise',
  RotateCounterClockwise: 'IconRotate',
  Sliders: 'IconAdjustmentsHorizontal', Settings2: 'IconAdjustmentsHorizontal',
  ShieldAlert: 'IconShieldExclamation',
  Smartphone: 'IconDeviceMobile',
  Zap: 'IconBolt',
  Shuffle: 'IconArrowsShuffle',
  FastForward: 'IconPlayerSkipForward', SkipForward: 'IconPlayerSkipForward',
  ChevronsUpDown: 'IconSelector', ChevronsDownUp: 'IconSelector',
  MoreHorizontal: 'IconDots', MoreVertical: 'IconDotsVertical',
  Image: 'IconPhoto', Mic: 'IconMicrophone', Globe: 'IconWorld', Wrench: 'IconTool',
  Lightbulb: 'IconBulb', ArchiveX: 'IconArchiveOff',
  BarChart3: 'IconChartBar', BarChart: 'IconChartBar', BarChart2: 'IconChartBar',
  ListChecks: 'IconListCheck', ListTodo: 'IconListCheck', ListTree: 'IconList',
  Loader2: 'IconLoader2', Loader: 'IconLoader',
  Trash2: 'IconTrash', Trash: 'IconTrash',
  Settings: 'IconSettings',
  Infinity: 'IconInfinity',
  Sparkles: 'IconSparkles',
  BellRing: 'IconBellRinging',
  CalendarDays: 'IconCalendarMonth',
  Info: 'IconInfoCircle',
  LogOut: 'IconLogout',
  PenSquare: 'IconPencil',
  Play: 'IconPlayerPlay',
  RefreshCw: 'IconRefresh',
  TriangleAlert: 'IconAlertTriangle',
}

const icons = actual.union.filter((n) => !TYPE_IMPORTS.has(n))
const map = {}
const unresolved = []
for (const name of icons) {
  let tabler = SPECIAL[name] || 'Icon' + name
  if (!(tabler in T)) {
    // try a couple of automatic fallbacks
    const alt = ['Icon' + name.replace(/([a-z])([0-9])/g, '$1'), 'Icon' + name.replace(/s$/, '')]
    const found = alt.find((a) => a in T)
    if (found) tabler = found
    else { unresolved.push(name); continue }
  }
  map[name] = tabler
}

console.log('icons:', icons.length, 'resolved:', Object.keys(map).length, 'unresolved:', unresolved.length)
if (unresolved.length) console.log('UNRESOLVED:', unresolved.join(', '))
fs.writeFileSync(new URL('./icon-map-final.json', import.meta.url), JSON.stringify({ map, unresolved, typeImports: [...TYPE_IMPORTS] }, null, 1))
