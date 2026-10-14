import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageForm } from "@/components/dashboard/forms";

export const metadata = { title: "Community" };

/**
 * Phase 4 ships the feed and the composer. Liking, editing, deletion and
 * moderation surfaces are Phase 5 (admin) — no controls are rendered that do
 * nothing.
 */
export default async function CommunityPage() {
  const user = await requireUser();

  const posts = await prisma.communityPost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: 50,
    include: {
      author: { select: { fullName: true } },
      comments: {
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { fullName: true } } },
      },
      _count: { select: { comments: { where: { status: "PUBLISHED" } } } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Community
        </h1>
        <p className="mt-1 text-sm text-muted">
          What members are talking about right now.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Start a discussion</CardTitle>
        </CardHeader>
        <CardContent>
          <MessageForm
            endpoint="/api/community/posts"
            label="Share with the community"
            field="body"
            placeholder="Ask a question, share a setup, or tell us what you are seeing in the markets."
            submitLabel="Publish"
            successMessage="Post published."
            redirectTo="/dashboard/community"
          />
        </CardContent>
      </Card>

      {posts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-faint">
              No discussions yet. Be the first to start one.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-4">
          {posts.map((post) => (
            <li key={post.id}>
              <Card className={post.isPinned ? "border-brand/40" : ""}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {post.isPinned && <Badge variant="brand">Pinned</Badge>}
                        <span className="text-sm font-semibold text-foreground">
                          {post.author.fullName}
                        </span>
                        <span className="text-xs text-faint">
                          {post.createdAt.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      {post.title && (
                        <h2 className="mt-2 font-display text-base font-semibold text-foreground">
                          {post.title}
                        </h2>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-faint">
                      {post.comments.length}{" "}
                      {post.comments.length === 1 ? "comment" : "comments"}
                    </span>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm text-muted">
                    {post.body}
                  </p>

                  <div className="mt-4 border-t border-border pt-4">
                    {post.comments.length > 0 ? (
                      <ul className="mb-3 space-y-3">
                        {post.comments.map((c) => (
                          <li key={c.id} className="text-sm">
                            <span className="font-semibold text-foreground">
                              {c.author.fullName}
                            </span>{" "}
                            <span className="text-xs text-faint">
                              {c.createdAt.toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                            <p className="whitespace-pre-wrap text-muted">{c.body}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mb-3 text-xs text-faint">No comments yet.</p>
                    )}

                    <MessageForm
                      endpoint={`/api/community/posts/${post.id}/comments`}
                      label="Add a comment"
                      minHeight={2}
                      placeholder="Reply to this post…"
                      submitLabel="Comment"
                      successMessage="Comment added."
                    />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
