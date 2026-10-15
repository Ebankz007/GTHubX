import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POST_STATUSES } from "@/lib/validators";
import type { PostStatus } from "@/lib/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommunityActions } from "@/components/admin/community-actions";

export const metadata = { title: "Community" };

const FILTERS = ["ALL", ...POST_STATUSES] as const;

function statusVariant(s: string) {
  return s === "PUBLISHED" ? "success" : s === "HIDDEN" ? "warning" : "danger";
}

/**
 * Community moderation. Nothing here deletes content — hidden and removed
 * items keep their row and can be restored, which is why there is no
 * destructive control to confirm.
 */
export default async function AdminCommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPermission("community");

  const { status } = await searchParams;
  const active = (FILTERS as readonly string[]).includes(status ?? "")
    ? (status as PostStatus | "ALL")
    : "ALL";
  const where = active === "ALL" ? undefined : { status: active };

  const [posts, comments, counts] = await Promise.all([
    prisma.communityPost.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        body: true,
        status: true,
        isPinned: true,
        createdAt: true,
        author: { select: { fullName: true, email: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.communityComment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        body: true,
        status: true,
        createdAt: true,
        author: { select: { fullName: true, email: true } },
        post: { select: { title: true, body: true } },
      },
    }),
    prisma.communityPost.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countFor = (s: string) =>
    counts.find((c) => c.status === s)?._count._all ?? 0;

  const excerpt = (text: string, max = 140) =>
    text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Community
        </h1>
        <p className="mt-1 text-sm text-muted">
          Posts and comments. Nothing is deleted — hidden and removed content is
          kept and can be restored.
        </p>
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "ALL" ? "/admin/community" : `/admin/community?status=${f}`}
            className={
              f === active
                ? "rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-background"
                : "rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-elevated"
            }
          >
            {f === "ALL"
              ? "All"
              : `${f.charAt(0)}${f.slice(1).toLowerCase()} (${countFor(f)})`}
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>Posts</CardTitle>
          <CardDescription>
            Newest first. Pinning keeps a post at the top of the member feed.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {posts.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-faint">
              {active === "ALL"
                ? "No community posts yet."
                : `No posts with status ${active}.`}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Post</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Author</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Posted</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Moderate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {posts.map((p) => (
                    <tr key={p.id} className="align-top transition-colors hover:bg-elevated/50">
                      <td className="max-w-[22rem] px-5 py-3">
                        <p className="font-medium text-foreground">
                          {p.title || <span className="text-faint">(no title)</span>}
                          {p.isPinned && (
                            <Badge variant="brand" className="ml-2">Pinned</Badge>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-muted">{excerpt(p.body)}</p>
                        <p className="mt-1 text-xs text-faint">
                          {p._count.comments} comment{p._count.comments === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-foreground">{p.author.fullName}</p>
                        <p className="text-xs text-faint">{p.author.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-faint">
                        {p.createdAt.toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <CommunityActions
                          entity="posts"
                          id={p.id}
                          status={p.status}
                          isPinned={p.isPinned}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comments</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {comments.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-faint">
              {active === "ALL"
                ? "No community comments yet."
                : `No comments with status ${active}.`}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Comment</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">On post</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Author</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Moderate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {comments.map((c) => (
                    <tr key={c.id} className="align-top transition-colors hover:bg-elevated/50">
                      <td className="max-w-[20rem] px-5 py-3 text-muted">
                        {excerpt(c.body)}
                      </td>
                      <td className="max-w-[14rem] px-5 py-3 text-xs text-faint">
                        {c.post.title || excerpt(c.post.body, 60)}
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-foreground">{c.author.fullName}</p>
                        <p className="text-xs text-faint">{c.author.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <CommunityActions entity="comments" id={c.id} status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
