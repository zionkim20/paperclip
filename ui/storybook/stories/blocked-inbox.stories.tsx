import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Issue, IssueBlockedInboxAttention } from "@paperclipai/shared";
import { BlockedInboxView } from "@/components/BlockedInboxView";
import { BlockedReasonChip } from "@/components/BlockedReasonChip";
import { defaultIssueFilterState } from "@/lib/issue-filters";
import { queryKeys } from "@/lib/queryKeys";
import { storybookIssues } from "../fixtures/paperclipData";

const companyId = "company-storybook";
const blockedViewDefaults = {
  groupBy: "none" as const,
  sortBy: "most_recent" as const,
  issueFilters: defaultIssueFilterState,
  currentUserId: "local-board",
  liveIssueIds: new Set<string>(),
  workspaceFilterContext: {},
  showStatusColumn: true,
  showIdentifierColumn: true,
  showUpdatedColumn: true,
};

// HUM-126 mockup fixtures: same companyId is reused so the leverage stories
// don't compete with the existing DesktopLoaded story's queryClient cache.
const leverageCompanyId = "company-storybook-hum126";

function blocker(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    identifier: id,
    title: `Blocker ${id}`,
    status: "in_progress",
    priority: "medium",
    assigneeAgentId: null,
    assigneeUserId: null,
    ...overrides,
  } as unknown as NonNullable<Issue["blockedBy"]>[number];
}

// Three downstream issues all cite HUM-185 as their blocker, so HUM-185 has
// fan-out 3 — the leverage chip + sort should surface them first. A fourth
// issue is critical-severity but has a unique blocker (fan-out 1), so under
// the new leverage sort it ranks below the shared-blocker rows. Under the
// old "most_recent" sort the critical-but-lonely one would sit on top.
//
// Built lazily inside the component so the bundler can't re-order `baseIssue`
// out from under us at module init time — Vite's prod bundler hoists const
// initializers and a spread-at-module-load against baseIssue caused TDZ.
function buildLeverageFixtures(): Issue[] {
  return [
    {
      ...baseIssue,
      id: "hum-126-mock-1",
      identifier: "HUM-220",
      title: "Ship new client portal page",
      status: "blocked",
      blockedBy: [blocker("HUM-185", { title: "Tighten auth on portal", status: "in_review" })],
      blockedInboxAttention: attention({
        reason: "blocked_chain_stalled",
        severity: "high",
        stoppedSinceAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
        owner: { type: "user", agentId: null, userId: "zion", label: "Zion" },
        action: { label: "Approve HUM-185 plan", detail: null },
      }),
    },
    {
      ...baseIssue,
      id: "hum-126-mock-2",
      identifier: "HUM-221",
      title: "Refactor placement-fee billing path",
      status: "blocked",
      blockedBy: [blocker("HUM-185", { title: "Tighten auth on portal", status: "in_review" })],
      blockedInboxAttention: attention({
        reason: "blocked_chain_stalled",
        severity: "medium",
        stoppedSinceAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
        owner: { type: "user", agentId: null, userId: "zion", label: "Zion" },
        action: { label: "Approve HUM-185 plan", detail: null },
      }),
    },
    {
      ...baseIssue,
      id: "hum-126-mock-3",
      identifier: "HUM-222",
      title: "Resume Twilio SMS rollout",
      status: "blocked",
      blockedBy: [blocker("HUM-185", { title: "Tighten auth on portal", status: "in_review" })],
      blockedInboxAttention: attention({
        reason: "blocked_chain_stalled",
        severity: "low",
        stoppedSinceAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        owner: { type: "user", agentId: null, userId: "zion", label: "Zion" },
        action: { label: "Approve HUM-185 plan", detail: null },
      }),
    },
    {
      ...baseIssue,
      id: "hum-126-mock-4",
      identifier: "HUM-230",
      title: "Tax attorney email reply",
      status: "blocked",
      blockedBy: [blocker("HUM-198", { title: "Wait on IRS transcript", status: "blocked" })],
      blockedInboxAttention: attention({
        reason: "external_owner_action",
        severity: "critical",
        stoppedSinceAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        owner: { type: "external", agentId: null, userId: null, label: "IRS" },
        action: { label: "Awaiting IRS transcript", detail: null },
      }),
    },
  ];
}

// BEFORE-state fixtures: strip blockedBy so blockerFanOut is 0 and the chip
// renders nowhere — matches today's behavior on Zion's live board.
const beforeCompanyId = "company-storybook-hum126-before";

function buildBeforeFixtures(): Issue[] {
  return buildLeverageFixtures().map((issue) => ({ ...issue, blockedBy: undefined }));
}

function PrimeLeverageFixtures({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  useMemo(() => {
    queryClient.setQueryData(queryKeys.issues.listBlockedAttention(leverageCompanyId), buildLeverageFixtures());
    queryClient.setQueryData(queryKeys.issues.listBlockedAttention(beforeCompanyId), buildBeforeFixtures());
  }, [queryClient]);
  return <>{children}</>;
}

function LeverageBeforeAfter() {
  return (
    <PrimeLeverageFixtures>
      <div className="mx-auto max-w-[1100px] space-y-5 p-4">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            BEFORE · today's Blocked tab (sortBy="most_recent", no leverage chip)
          </div>
          <BlockedInboxView
            {...blockedViewDefaults}
            sortBy="most_recent"
            companyId={beforeCompanyId}
            searchQuery=""
            agentNameById={new Map()}
            issueLinkState={null}
          />
        </div>
        <div className="rounded-lg border-2 border-amber-400/70 bg-amber-50/20 p-4 dark:border-amber-500/50 dark:bg-amber-500/5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            AFTER · new default (sortBy="leverage", amber "Blocks N issues" chip)
          </div>
          <BlockedInboxView
            {...blockedViewDefaults}
            sortBy="leverage"
            companyId={leverageCompanyId}
            searchQuery=""
            agentNameById={new Map()}
            issueLinkState={null}
          />
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          Same four mock issues in both views. HUM-220 / 221 / 222 all cite
          HUM-185 as their blocker — fan-out 3, marked with the amber "Blocks
          3 issues" chip in AFTER. HUM-230 is critical but has a unique
          blocker — fan-out 1, no chip.
          <br />
          Under <strong>"most_recent"</strong> (BEFORE) the order is just by
          age — recent items sit on top. Under <strong>"leverage"</strong>
          (AFTER) the three shared-blocker rows float up, because resolving
          HUM-185 unblocks three things at once. The critical-but-lonely
          HUM-230 sits below them because acting on it only frees itself.
        </div>
      </div>
    </PrimeLeverageFixtures>
  );
}

function attention(
  overrides: Partial<IssueBlockedInboxAttention> = {},
): IssueBlockedInboxAttention {
  return {
    kind: "blocked",
    state: "needs_attention",
    reason: "blocked_chain_stalled",
    severity: "medium",
    stoppedSinceAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    owner: { type: "agent", agentId: null, userId: null, label: "ClaudeCoder" },
    action: { label: "Resolve PAP-12", detail: null },
    sourceIssue: null,
    leafIssue: null,
    recoveryIssue: null,
    approvalId: null,
    interactionId: null,
    sampleIssueIdentifier: null,
    redaction: { externalDetailsRedacted: false, secretFieldsOmitted: true },
    ...overrides,
  };
}

const baseIssue = storybookIssues[0]!;

const fixtureIssues: Issue[] = [
  {
    ...baseIssue,
    id: "issue-decision-1",
    identifier: "PAP-401",
    title: "Approve plan: rewrite onboarding flow",
    status: "in_review",
    blockedInboxAttention: attention({
      reason: "pending_board_decision",
      state: "awaiting_decision",
      severity: "medium",
      stoppedSinceAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      owner: { type: "board", agentId: null, userId: null, label: "Board" },
      action: { label: "Accept or reject", detail: null },
    }),
  },
  {
    ...baseIssue,
    id: "issue-disposition-1",
    identifier: "PAP-402",
    title: "Pick disposition for completed migration",
    status: "in_progress",
    blockedInboxAttention: attention({
      reason: "missing_successful_run_disposition",
      state: "missing_disposition",
      severity: "medium",
      stoppedSinceAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      owner: { type: "agent", agentId: null, userId: null, label: "QA" },
      action: { label: "Pick disposition", detail: null },
    }),
  },
  {
    ...baseIssue,
    id: "issue-stalled-critical",
    identifier: "PAP-410",
    title: "Ship invoice export — blocker is stalled",
    status: "blocked",
    blockedInboxAttention: attention({
      reason: "blocked_chain_stalled",
      state: "needs_attention",
      severity: "critical",
      stoppedSinceAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
      owner: { type: "agent", agentId: null, userId: null, label: "CodexCoder" },
      action: { label: "Resolve PAP-411", detail: null },
    }),
  },
  {
    ...baseIssue,
    id: "issue-stalled-high",
    identifier: "PAP-412",
    title: "Run nightly compaction",
    status: "blocked",
    blockedInboxAttention: attention({
      reason: "blocked_chain_stalled",
      severity: "high",
      stoppedSinceAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      owner: { type: "agent", agentId: null, userId: null, label: "QA" },
      action: { label: "Resolve PAP-413", detail: null },
    }),
  },
  {
    ...baseIssue,
    id: "issue-needs-attention",
    identifier: "PAP-420",
    title: "Resume parked permissions PR",
    status: "blocked",
    blockedInboxAttention: attention({
      reason: "blocked_by_assigned_backlog_issue",
      severity: "medium",
      stoppedSinceAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      owner: { type: "agent", agentId: null, userId: null, label: "ClaudeCoder" },
      action: { label: "Resume parked blocker", detail: null },
    }),
  },
  {
    ...baseIssue,
    id: "issue-recovery",
    identifier: "PAP-430",
    title: "Recover failed deploy run",
    status: "blocked",
    blockedInboxAttention: attention({
      reason: "open_recovery_issue",
      state: "recovery_open",
      severity: "high",
      stoppedSinceAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      owner: { type: "agent", agentId: null, userId: null, label: "RecoveryAgent" },
      action: { label: "Resolve PAP-431", detail: null },
    }),
  },
  {
    ...baseIssue,
    id: "issue-external",
    identifier: "PAP-440",
    title: "Awaiting upstream provider response",
    status: "blocked",
    blockedInboxAttention: attention({
      reason: "external_owner_action",
      state: "external_wait",
      severity: "low",
      stoppedSinceAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      owner: { type: "external", agentId: null, userId: null, label: "Stripe" },
      action: { label: "Awaiting Stripe", detail: null },
    }),
  },
  {
    ...baseIssue,
    id: "issue-paused",
    identifier: "PAP-450",
    title: "Owner paused — budget exceeded",
    status: "blocked",
    blockedInboxAttention: attention({
      reason: "blocked_by_uninvokable_assignee",
      severity: "critical",
      stoppedSinceAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      owner: { type: "agent", agentId: null, userId: null, label: "PausedAgent" },
      action: { label: "Reassign or unblock budget", detail: null },
    }),
  },
];

function PrimeBlockedFixtures({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  useMemo(() => {
    queryClient.setQueryData(queryKeys.issues.listBlockedAttention(companyId), fixtureIssues);
  }, [queryClient]);
  return <>{children}</>;
}

function BlockedTabSurface({ search = "" }: { search?: string }) {
  return (
    <PrimeBlockedFixtures>
      <div className="space-y-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Inbox / Blocked tab — desktop layout
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <BlockedInboxView
            {...blockedViewDefaults}
            companyId={companyId}
            searchQuery={search}
            agentNameById={new Map()}
            issueLinkState={null}
          />
        </div>
      </div>
    </PrimeBlockedFixtures>
  );
}

function BlockedTabSurfaceMobile() {
  return (
    <div className="mx-auto max-w-[390px] space-y-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        Inbox / Blocked tab — 390px mobile width
      </div>
      <div className="rounded-lg border border-border bg-background p-2">
        <BlockedTabSurface />
      </div>
    </div>
  );
}

function BlockedReasonChipsCatalog() {
  return (
    <div className="grid gap-3 p-6 sm:grid-cols-2">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Needs decision · medium
        </div>
        <BlockedReasonChip reason="pending_board_decision" severity="medium" />
      </div>
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Blocked chain stalled · critical
        </div>
        <BlockedReasonChip reason="blocked_chain_stalled" severity="critical" />
      </div>
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Needs attention · high
        </div>
        <BlockedReasonChip reason="blocked_by_assigned_backlog_issue" severity="high" />
      </div>
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Recovery required · high
        </div>
        <BlockedReasonChip reason="open_recovery_issue" severity="high" />
      </div>
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          External wait · low (no severity dot)
        </div>
        <BlockedReasonChip reason="external_owner_action" severity="low" />
      </div>
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Owner paused · critical
        </div>
        <BlockedReasonChip reason="blocked_by_uninvokable_assignee" severity="critical" />
      </div>
    </div>
  );
}

function BlockedTabEmptyState() {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <BlockedInboxView
        {...blockedViewDefaults}
        companyId="company-empty"
        searchQuery=""
        agentNameById={new Map()}
        issueLinkState={null}
      />
    </div>
  );
}

const meta = {
  title: "Product/Inbox/Blocked tab",
  component: BlockedTabSurface,
  parameters: {
    docs: {
      description: {
        component:
          "Stopped-work triage Inbox tab. Rows group by reason variant and sort by severity → stoppedSinceAt. The reason chip + owner + action combo sits next to the issue title. No quick archive on this tab.",
      },
    },
  },
} satisfies Meta<typeof BlockedTabSurface>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DesktopLoaded: Story = {
  render: () => <BlockedTabSurface />,
};

export const DesktopWithSearch: Story = {
  render: () => <BlockedTabSurface search="parked" />,
};

export const MobileLayout: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => <BlockedTabSurfaceMobile />,
};

export const ReasonChipCatalog: Story = {
  render: () => <BlockedReasonChipsCatalog />,
};

export const LeverageBeforeAfterStory: Story = {
  name: "HUM-126 · Leverage sort + chip — before/after",
  render: () => <LeverageBeforeAfter />,
  parameters: {
    docs: {
      description: {
        story:
          "HUM-126 mockup. Shows the Blocked inbox tab with the same four issues rendered twice — once under the old most_recent sort, once under the new leverage sort with the 'Blocks N issues' chip. Compare the row order: leverage surfaces shared-blocker rows above lonely-critical rows, because resolving the gating blocker frees more downstream work.",
      },
    },
  },
};

export const EmptyState: Story = {
  render: () => <BlockedTabEmptyState />,
};
