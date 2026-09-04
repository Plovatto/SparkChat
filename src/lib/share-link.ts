interface ShareLinkInput {
  text: string;
  url: string;
}

export function shareLinkNatively({ text, url }: ShareLinkInput): boolean {
  if (!navigator.share) {
    return false;
  }

  navigator.share({ title: 'SparkChat', text, url }).catch(() => undefined);
  return true;
}
