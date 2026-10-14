export type NavItem = {
  href: string;
  label: string;
  description: string;
};

/**
 * Only routes that actually exist are listed here.
 *
 * A nav item pointing at an unbuilt page is a decorative dead link, which
 * PLAN §3 forbids. Wallet / Network / Packages / Copy / Community / Support
 * get added as their phases land — they are not listed in advance.
 */
export const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    description: "Account status and recent activity",
  },
  {
    href: "/dashboard/verification",
    label: "Verification",
    description: "Identity verification status",
  },
  {
    href: "/dashboard/notifications",
    label: "Notifications",
    description: "Account and platform messages",
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    description: "Profile, password and security",
  },
];
