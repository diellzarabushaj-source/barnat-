# ICD production source status

The full ICD hierarchy API currently cannot read the private Google Sheet through the anonymous `gviz` CSV endpoint. Production returns HTTP 401. The UI must therefore show an explicit retry/error state and must not mislabel the 701-code curated Neon collection as the complete 12,542-node hierarchy.

The long-term source should be one of:

1. a server-readable Google credential,
2. a validated private snapshot stored in Neon or Vercel Blob, or
3. link-viewer access for the source Sheet.

The hierarchy tree redesign is independent of that transport and continues to use the existing `nav`, `children`, `resolve` and `suggest` API contracts.
