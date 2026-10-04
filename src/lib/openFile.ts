/**
 * Opens a private file in a new tab. The tab opens on the click itself, so a
 * popup blocker lets it through, and the short-lived link arrives after.
 */
export async function openFile(getUrl: () => Promise<string>) {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const url = await getUrl();
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (e) {
    tab?.close();
    throw e;
  }
}
