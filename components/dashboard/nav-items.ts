export type NavItem = {
  href: string;
  label: string;
  description: string;
};

/**
 * Only routes that actually exist are listed here.
 *
 * A nav item pointing at an unbuilt page is a decorative dead link, which
 * PLAN §3 forbids. Wallet / Network / Packages / Copy arrive when their phase
 * (and, for packages, Henry's business content) lands — they are not listed
 * in advance.
 */
export const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    description: "Account status and recent activity",
  },
  {
    href: "/dashboard/transactions",
    label: "Transactions",
    description: "Your ledger history",
  },
  {
    href: "/dashboard/community",
    label: "Community",
    description: "Member discussions",
  },
  {
    href: "/dashboard/support",
    label: "Support",
    description: "Tickets and replies",
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
