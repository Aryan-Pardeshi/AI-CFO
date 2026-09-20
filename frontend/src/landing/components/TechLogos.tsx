/* Hand-built, monochrome inline marks — no external images.
   Each glyph inherits currentColor and fits a 24x24 box. */

type IconProps = { className?: string };

function Svg({ className = "h-[18px] w-[18px]", children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function ReactMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <g>
        <ellipse cx="12" cy="12" rx="9.5" ry="3.7" />
        <ellipse cx="12" cy="12" rx="9.5" ry="3.7" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="9.5" ry="3.7" transform="rotate(120 12 12)" />
      </g>
    </Svg>
  );
}

export function ViteMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3 L4 5 L12 21 L20 5 Z" fill="currentColor" fillOpacity="0.12" />
      <path d="M12 3 L4 5 L12 21 L20 5 Z" />
      <path d="M12.4 8.5 L9 13 h2.4l-1 3.2 L15 10.4 h-2.4l0.8-1.9Z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function AmplifyMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 8 L9 20 L11.5 20" />
      <path d="M20 8 L15 20" />
      <path d="M8 8 H16" />
      <path d="M14.5 8 L17.5 14.5" />
    </Svg>
  );
}

export function CognitoMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3 L19 6 V11 C19 15.5 16 19 12 21 C8 19 5 15.5 5 11 V6 Z" />
      <circle cx="12" cy="10.5" r="2.1" />
      <path d="M8.2 17 C8.9 15 10.2 14 12 14 C13.8 14 15.1 15 15.8 17" />
    </Svg>
  );
}

export function GatewayMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M4 9 H20 M4 15 H20" />
      <path d="M9 9 V4 M15 9 V4 M9 20 V15 M15 20 V15" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function LambdaMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path
        d="M14.2 7.5 L10.6 12 L12.6 12 L9.6 16.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </Svg>
  );
}

export function DynamoMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <ellipse cx="12" cy="6" rx="7" ry="2.6" />
      <path d="M5 6 V18 C5 19.4 8.1 20.6 12 20.6 C15.9 20.6 19 19.4 19 18 V6" />
      <path d="M8.2 10.6 H15.8 M8.2 13.4 H15.8 M10 16.2 H14" strokeOpacity="0.6" />
    </Svg>
  );
}

export function S3Mark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 8 C5 6.3 8.1 5 12 5 C15.9 5 19 6.3 19 8" />
      <path d="M5 8 C5 9.7 8.1 11 12 11 C15.9 11 19 9.7 19 8" />
      <path d="M5 8 V16 C5 17.7 8.1 19 12 19 C15.9 19 19 17.7 19 16 V8" />
    </Svg>
  );
}

export function AppSyncMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M7.8 7.2 L10.2 10.8 M16.2 7.2 L13.8 10.8 M7.8 16.8 L10.2 13.2 M16.2 16.8 L13.8 13.2" strokeOpacity="0.7" />
    </Svg>
  );
}

export function SecretsMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3 L19 6 V11 C19 15.5 16 19 12 21 C8 19 5 15.5 5 11 V6 Z" />
      <circle cx="12" cy="10.5" r="2" fill="currentColor" stroke="none" />
      <path d="M12 12.5 V16" />
    </Svg>
  );
}

export function CloudWatchMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6.5 17 A4.5 4.5 0 1 1 16 12.5 A3.8 3.8 0 0 1 18 17 Z" fill="currentColor" fillOpacity="0.1" />
      <path d="M6.5 17 A4.5 4.5 0 1 1 16 12.5 A3.8 3.8 0 0 1 18 17 Z" />
      <path d="M12 13 L15.5 9.5" />
      <circle cx="12" cy="13" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function SamMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 4 L4 8 L8 12" />
      <path d="M16 4 L20 8 L16 12" />
      <path d="M13.5 5 L10.5 11" />
      <path d="M4 16 H20" strokeOpacity="0.6" />
    </Svg>
  );
}

export function StrandsMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="5" cy="6" r="1.6" />
      <circle cx="19" cy="6" r="1.6" />
      <circle cx="5" cy="18" r="1.6" />
      <circle cx="19" cy="18" r="1.6" />
      <path d="M6.4 7 L10.2 10.8 M17.6 7 L13.8 10.8 M6.4 17 L10.2 13.2 M17.6 17 L13.8 13.2" strokeOpacity="0.7" />
    </Svg>
  );
}

export function ModelMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M12 3 V7 M12 17 V21 M3 12 H7 M17 12 H21 M5.5 5.5 L8 8 M18.5 5.5 L16 8 M5.5 18.5 L8 16 M18.5 18.5 L16 16" />
    </Svg>
  );
}
