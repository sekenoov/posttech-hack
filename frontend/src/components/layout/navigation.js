import HomeIcon from '@mui/icons-material/HomeOutlined';
import PersonIcon from '@mui/icons-material/PersonOutlineRounded';
import EventNoteIcon from '@mui/icons-material/EventNoteOutlined';
import GroupsIcon from '@mui/icons-material/GroupsOutlined';
import NotificationsIcon from '@mui/icons-material/NotificationsNoneRounded';
import BadgeIcon from '@mui/icons-material/BadgeOutlined';
import SchoolIcon from '@mui/icons-material/SchoolOutlined';
import AssignmentIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeOutlined';
import MenuBookIcon from '@mui/icons-material/MenuBookOutlined';
import EditNoteIcon from '@mui/icons-material/EditNoteOutlined';
import HubIcon from '@mui/icons-material/HubOutlined';
import TroubleshootIcon from '@mui/icons-material/TroubleshootOutlined';

// Sidebar entries per role. Only screens that actually work are listed;
// new modules add themselves here when implemented.
export const NAV_SECTIONS = [
  {
    key: 'sectionMain',
    items: [
      { to: '/', label: 'nav.dashboard', icon: HomeIcon, exact: true },
      { to: '/profile', label: 'nav.profile', icon: PersonIcon },
      { to: '/requests', label: 'nav.requests', icon: EventNoteIcon },
      { to: '/academy', label: 'nav.academy', icon: SchoolIcon },
      { to: '/assistant', label: 'nav.assistant', icon: AutoAwesomeIcon },
      { to: '/knowledge', label: 'nav.knowledge', icon: MenuBookIcon },
      { to: '/notifications', label: 'nav.notifications', icon: NotificationsIcon, badge: 'unread' },
    ],
  },
  {
    key: 'sectionManage',
    roles: ['manager', 'hr'],
    items: [
      { to: '/team', label: 'nav.team', labelHr: 'nav.teamHr', icon: GroupsIcon, roles: ['manager', 'hr'] },
      { to: '/admin/employees', label: 'nav.employees', icon: BadgeIcon, roles: ['hr'] },
      { to: '/admin/academy', label: 'nav.adminAcademy', icon: AssignmentIcon, roles: ['hr'] },
      { to: '/admin/knowledge', label: 'nav.kbEditor', icon: EditNoteIcon, roles: ['hr'] },
      { to: '/admin/knowledge-gaps', label: 'nav.gaps', icon: TroubleshootIcon, roles: ['hr'] },
      { to: '/admin/integrations', label: 'nav.integrations', icon: HubIcon, roles: ['hr'] },
    ],
  },
];

export const visibleSections = (role) =>
  NAV_SECTIONS
    .filter((s) => !s.roles || s.roles.includes(role))
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.roles || i.roles.includes(role)) }))
    .filter((s) => s.items.length);
