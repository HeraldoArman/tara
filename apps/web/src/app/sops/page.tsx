import { ArrowUpRight, BookOpen, FilePlus2 } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import {
  AppShell,
  EmptyState,
  PageHeading,
  PageUnavailable,
  Status,
} from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { List, Sop, User } from "@/lib/contracts";
import { currentUser, serverApi } from "@/lib/server-api";
export default async function SopsPage() {
  let data: { user: User; sops: List<Sop> };
  try {
    const user = await currentUser();
    const sops = await serverApi<List<Sop>>("/sops");
    data = { sops, user };
  } catch (e) {
    unstable_rethrow(e);
    return <PageUnavailable message={errorMessage(e)} />;
  }
  const { user, sops } = data;
  const canEdit = ["owner", "sop_manager"].includes(user.role);
  return (
    <AppShell active="/sops" user={user}>
      <PageHeading
        description="Approved procedures, controlled versions and the sources behind every step."
        eyebrow="PROCEDURES / LIBRARY"
        title="The right way, on record."
      >
        {canEdit ? (
          <Link className="button primary" href="/sops/import">
            <FilePlus2 size={16} />
            Import a procedure
          </Link>
        ) : null}
      </PageHeading>
      {sops.items.length ? (
        <div className="sop-library">
          {sops.items.map((sop) => (
            <section className="panel sop-library-card" key={sop.id}>
              <div className="sop-library-icon">
                <BookOpen size={25} />
              </div>
              <div>
                <p className="eyebrow">{sop.key}</p>
                <h2>{sop.title}</h2>
                <div className="sop-versions">
                  {sop.versions.map((version) => (
                    <Link
                      href={`/sops/${sop.id}/versions/${version.version}`}
                      key={version.id}
                    >
                      <span>Version {version.version}</span>
                      <Status value={version.status} />
                      <ArrowUpRight size={17} />
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          description="An SOP manager can import a source document, review its draft, and publish an approved version."
          title="Your procedures start here."
        />
      )}
    </AppShell>
  );
}
