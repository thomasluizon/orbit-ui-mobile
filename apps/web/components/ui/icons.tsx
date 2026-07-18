/**
 * Orbit icon barrel (web). The ONE place app icons come from: Tabler icons wrapped
 * to a Lucide-compatible prop shape (`strokeWidth` default 1.8, `size` default 22) so callsites
 * are unchanged and a future icon-set swap is this single file. Direct '@tabler/*' / 'lucide-*'
 * imports are banned outside this file. #539 b6 (Lucide -> Tabler).
 */
import type { ComponentType } from 'react'
import {
  type Icon as TablerIcon,
  type IconProps as TablerIconProps,
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconArchiveOff,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconArrowUpRight,
  IconArrowsShuffle,
  IconBell,
  IconBellRinging,
  IconBolt,
  IconBrain,
  IconBulb,
  IconCalendar,
  IconCalendarCheck,
  IconCalendarClock,
  IconCalendarMonth,
  IconChartBar,
  IconChartLine,
  IconCheck,
  IconChecks,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCircle,
  IconCircleCheck,
  IconCircleDotted,
  IconCircleX,
  IconClipboard,
  IconClock,
  IconCompass,
  IconCopy,
  IconCreditCard,
  IconCrown,
  IconDeviceMobile,
  IconDots,
  IconDotsVertical,
  IconDownload,
  IconEye,
  IconFileText,
  IconFilter,
  IconFlame,
  IconGift,
  IconGripHorizontal,
  IconHeart,
  IconHelpCircle,
  IconHome,
  IconInfinity,
  IconInfoCircle,
  IconLanguage,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRight,
  IconLink,
  IconList,
  IconListCheck,
  IconLoader2,
  IconLock,
  IconLogout,
  IconMail,
  IconMaximize,
  IconMessage,
  IconMessageCircle,
  IconMicrophone,
  IconMinimize,
  IconMoon,
  IconPalette,
  IconPaperclip,
  IconPencil,
  IconPhoto,
  IconPlayerPlay,
  IconPlayerSkipForward,
  IconPlus,
  IconReceipt,
  IconRefresh,
  IconRepeat,
  IconRotate,
  IconRotateClockwise,
  IconSatellite,
  IconSearch,
  IconSelector,
  IconSettings,
  IconShare2,
  IconShield,
  IconShieldCheck,
  IconShieldExclamation,
  IconSnowflake,
  IconSparkles,
  IconSquare,
  IconSquareX,
  IconStar,
  IconSun,
  IconTag,
  IconTarget,
  IconTool,
  IconTrash,
  IconTrendingDown,
  IconTrendingUp,
  IconTrophy,
  IconUpload,
  IconUser,
  IconUserPlus,
  IconUserX,
  IconUsers,
  IconWifiOff,
  IconWorld,
  IconX,
} from '@tabler/icons-react'

/** Lucide-compatible icon props. `strokeWidth` maps to Tabler's stroke width. */
export interface IconProps extends Omit<TablerIconProps, 'stroke'> {
  strokeWidth?: number | string
  stroke?: number | string
}
export type LucideProps = IconProps
export type LucideIcon = ComponentType<IconProps>

function makeIcon(Tabler: TablerIcon): ComponentType<IconProps> {
  return function Icon({ size = 22, strokeWidth = 1.8, stroke, ...rest }: IconProps) {
    return <Tabler size={size} stroke={stroke ?? strokeWidth} {...rest} />
  }
}

export const AlertTriangle = makeIcon(IconAlertTriangle)
export const ArchiveX = makeIcon(IconArchiveOff)
export const ArrowLeft = makeIcon(IconArrowLeft)
export const ArrowRight = makeIcon(IconArrowRight)
export const ArrowUp = makeIcon(IconArrowUp)
export const ArrowUpRight = makeIcon(IconArrowUpRight)
export const BarChart3 = makeIcon(IconChartBar)
export const Bell = makeIcon(IconBell)
export const BellRing = makeIcon(IconBellRinging)
export const Brain = makeIcon(IconBrain)
export const Calendar = makeIcon(IconCalendar)
export const CalendarCheck = makeIcon(IconCalendarCheck)
export const CalendarClock = makeIcon(IconCalendarClock)
export const CalendarDays = makeIcon(IconCalendarMonth)
export const ChartLine = makeIcon(IconChartLine)
export const Check = makeIcon(IconCheck)
export const CheckCheck = makeIcon(IconChecks)
export const CheckCircle = makeIcon(IconCircleCheck)
export const CheckCircle2 = makeIcon(IconCircleCheck)
export const ChevronDown = makeIcon(IconChevronDown)
export const ChevronLeft = makeIcon(IconChevronLeft)
export const ChevronRight = makeIcon(IconChevronRight)
export const ChevronUp = makeIcon(IconChevronUp)
export const ChevronsDownUp = makeIcon(IconSelector)
export const ChevronsUpDown = makeIcon(IconSelector)
export const Circle = makeIcon(IconCircle)
export const CircleHelp = makeIcon(IconHelpCircle)
export const Clipboard = makeIcon(IconClipboard)
export const Clock = makeIcon(IconClock)
export const Clock3 = makeIcon(IconClock)
export const Compass = makeIcon(IconCompass)
export const Copy = makeIcon(IconCopy)
export const CreditCard = makeIcon(IconCreditCard)
export const Crown = makeIcon(IconCrown)
export const Download = makeIcon(IconDownload)
export const Expand = makeIcon(IconMaximize)
export const Eye = makeIcon(IconEye)
export const FastForward = makeIcon(IconPlayerSkipForward)
export const FileText = makeIcon(IconFileText)
export const Filter = makeIcon(IconFilter)
export const Flame = makeIcon(IconFlame)
export const Gift = makeIcon(IconGift)
export const Globe = makeIcon(IconWorld)
export const GripHorizontal = makeIcon(IconGripHorizontal)
export const Heart = makeIcon(IconHeart)
export const HelpCircle = makeIcon(IconHelpCircle)
export const Home = makeIcon(IconHome)
export const Image = makeIcon(IconPhoto)
export const InfinityIcon = makeIcon(IconInfinity)
export const Info = makeIcon(IconInfoCircle)
export const Languages = makeIcon(IconLanguage)
export const Lightbulb = makeIcon(IconBulb)
export const Link = makeIcon(IconLink)
export const List = makeIcon(IconList)
export const ListChecks = makeIcon(IconListCheck)
export const ListTodo = makeIcon(IconListCheck)
export const ListTree = makeIcon(IconList)
export const Loader2 = makeIcon(IconLoader2)
export const Lock = makeIcon(IconLock)
export const LogOut = makeIcon(IconLogout)
export const Mail = makeIcon(IconMail)
export const Maximize2 = makeIcon(IconMaximize)
export const MessageCircle = makeIcon(IconMessageCircle)
export const MessageSquare = makeIcon(IconMessage)
export const Mic = makeIcon(IconMicrophone)
export const Minimize2 = makeIcon(IconMinimize)
export const Moon = makeIcon(IconMoon)
export const MoreHorizontal = makeIcon(IconDots)
export const MoreVertical = makeIcon(IconDotsVertical)
export const Orbit = makeIcon(IconCircleDotted)
export const Palette = makeIcon(IconPalette)
export const PanelLeft = makeIcon(IconLayoutSidebarLeftExpand)
export const PanelLeftClose = makeIcon(IconLayoutSidebarLeftCollapse)
export const PanelRight = makeIcon(IconLayoutSidebarRight)
export const Paperclip = makeIcon(IconPaperclip)
export const PenSquare = makeIcon(IconPencil)
export const Pencil = makeIcon(IconPencil)
export const PencilLine = makeIcon(IconPencil)
export const Play = makeIcon(IconPlayerPlay)
export const Plus = makeIcon(IconPlus)
export const Receipt = makeIcon(IconReceipt)
export const RefreshCw = makeIcon(IconRefresh)
export const Repeat = makeIcon(IconRepeat)
export const RotateCcw = makeIcon(IconRotate)
export const RotateCw = makeIcon(IconRotateClockwise)
export const Satellite = makeIcon(IconSatellite)
export const Search = makeIcon(IconSearch)
export const Settings = makeIcon(IconSettings)
export const Settings2 = makeIcon(IconAdjustmentsHorizontal)
export const Share2 = makeIcon(IconShare2)
export const Shield = makeIcon(IconShield)
export const ShieldAlert = makeIcon(IconShieldExclamation)
export const ShieldCheck = makeIcon(IconShieldCheck)
export const Shuffle = makeIcon(IconArrowsShuffle)
export const SkipForward = makeIcon(IconPlayerSkipForward)
export const Smartphone = makeIcon(IconDeviceMobile)
export const Snowflake = makeIcon(IconSnowflake)
export const Sparkles = makeIcon(IconSparkles)
export const Square = makeIcon(IconSquare)
export const SquareX = makeIcon(IconSquareX)
export const Star = makeIcon(IconStar)
export const Sun = makeIcon(IconSun)
export const Tag = makeIcon(IconTag)
export const Target = makeIcon(IconTarget)
export const Trash2 = makeIcon(IconTrash)
export const TrendingDown = makeIcon(IconTrendingDown)
export const TrendingUp = makeIcon(IconTrendingUp)
export const TriangleAlert = makeIcon(IconAlertTriangle)
export const Trophy = makeIcon(IconTrophy)
export const Upload = makeIcon(IconUpload)
export const User = makeIcon(IconUser)
export const UserPlus = makeIcon(IconUserPlus)
export const UserX = makeIcon(IconUserX)
export const Users = makeIcon(IconUsers)
export const WifiOff = makeIcon(IconWifiOff)
export const Wrench = makeIcon(IconTool)
export const X = makeIcon(IconX)
export const XCircle = makeIcon(IconCircleX)
export const Zap = makeIcon(IconBolt)

export { InfinityIcon as Infinity }
