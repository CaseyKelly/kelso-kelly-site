const GITHUB_REPO = 'CaseyKelly/kelso-kelly-site';
const WORKFLOW_FILE = 'sync-drive-videos-to-youtube.yml';

/**
 * Triggers the sync-drive-videos-to-youtube GitHub Actions workflow via
 * workflow_dispatch. Used to react instantly to a Drive change instead of
 * waiting for the workflow's scheduled cron — the upload itself still runs
 * on a GitHub Actions runner, not here, since it can be slow/large enough
 * to risk a Vercel function timeout.
 */
export async function triggerYoutubeSyncWorkflow(): Promise<void> {
  if (!process.env.GITHUB_ACTIONS_TOKEN) {
    throw new Error('GITHUB_ACTIONS_TOKEN not configured');
  }

  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_ACTIONS_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub workflow dispatch failed (${response.status}): ${body}`);
  }
}
