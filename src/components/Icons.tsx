// Icons used across the app, from react-icons: the Lucide set, plus the GitHub
// mark from Simple Icons (Lucide has no brand icons). 16px by default.
import type { IconBaseProps, IconType } from 'react-icons';
import {
  LuCheck,
  LuChevronLeft,
  LuChevronRight,
  LuCopy,
  LuDownload,
  LuExternalLink,
  LuGlobe,
  LuInfo,
  LuLayoutGrid,
  LuLoaderCircle,
  LuMenu,
  LuMonitor,
  LuMoon,
  LuSearch,
  LuServer,
  LuSun,
  LuTrash2,
  LuTriangleAlert,
  LuUpload,
  LuX,
} from 'react-icons/lu';
import { SiGithub } from 'react-icons/si';

type IconProps = IconBaseProps & { strokeWidth?: number };

const sized = (Icon: IconType) => {
  const Sized = ({ size = 16, ...rest }: IconProps) => <Icon size={size} aria-hidden="true" {...rest} />;
  Sized.displayName = `${Icon.name}Icon`;
  return Sized;
};

export const AlertIcon = sized(LuTriangleAlert);
export const CheckIcon = sized(LuCheck);
export const ChevronIcon = sized(LuChevronRight);
export const CloseIcon = sized(LuX);
export const CopyIcon = sized(LuCopy);
export const DownloadIcon = sized(LuDownload);
export const ExternalIcon = sized(LuExternalLink);
export const GitHubIcon = sized(SiGithub);
export const GlobeIcon = sized(LuGlobe);
export const InfoIcon = sized(LuInfo);
export const LeftIcon = sized(LuChevronLeft);
export const LibraryIcon = sized(LuLayoutGrid);
export const MenuIcon = sized(LuMenu);
export const MonitorIcon = sized(LuMonitor);
export const MoonIcon = sized(LuMoon);
export const RackIcon = sized(LuServer);
export const SearchIcon = sized(LuSearch);
export const SunIcon = sized(LuSun);
export const TrashIcon = sized(LuTrash2);
export const UploadIcon = sized(LuUpload);

const Loader = sized(LuLoaderCircle);
export const LoaderIcon = ({ className, ...rest }: IconProps) => <Loader className={`animate-spin ${className ?? ''}`} {...rest} />;
