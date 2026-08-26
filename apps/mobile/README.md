# Dramatic mobile

The native product is an Expo Router application for iOS and Android. Feed gestures, story navigation, search and genre filters, voting, native video playback, loading/error states, wallet choices, paywall behavior, and accessibility affordances are implemented. Likes, saves, choices, and watch progress persist on-device through AsyncStorage. Catalog entries play a local generated MP4 when present and show an honest production-state poster when it is not. Real billing and cross-device account state remain behind the provider/API seams described in the root README.

Run commands from the repository root:

```bash
pnpm dev:mobile
pnpm --filter @dramatic/mobile android
pnpm --filter @dramatic/mobile ios
pnpm --filter @dramatic/mobile build
```

`pnpm sync:content` generates `src/data/stories.generated.ts` from the root `series/` catalog. Do not hand-edit the generated file. Native identifiers and EAS development, preview, and production profiles are checked in through `app.json` and `eas.json`.

Never expose Higgsfield or payment credentials through an `EXPO_PUBLIC_` variable. The app should call Dramatic's own API after those production services are connected.
