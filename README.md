# Focus Nudge

A browser extension that provides playful nudges when you drift into endless scrolling on LinkedIn. Helps you use LinkedIn more intentionally with gentle, customizable reminders.

## Features

- 🎯 **Smart Detection**: Identifies when you're passively scrolling (drift mode)
- 💬 **Playful Messages**: Choose from sarcastic, motivational, or gentle tones (Pro)
- ⚙️ **Customizable**: Set your drift threshold and cooldown periods (Pro)
- 📊 **Weekly Summary**: Track nudges, early exits, and estimated time reclaimed
- 🔒 **Privacy First**: No data collection, no tracking, everything runs locally
- 🎨 **Non-Intrusive**: Gentle reminders that don't block your browsing

## Plans

### Basic (Free)
- Fixed tone: Gentle
- Fixed drift threshold: 15 minutes
- Fixed cooldown: 30 minutes
- Weekly summary included

### Pro ($9.99/month)
- Customizable tone: Gentle / Motivational / Sarcastic
- Customizable drift threshold: 1-120 minutes
- Customizable cooldown: 1-120 minutes
- Weekly summary with Pro label
- Manage subscription via Stripe Customer Portal

*Pro features are activated via Stripe subscription. Upgrade anytime from the Options page.*

## How It Works

Focus Nudge monitors your activity on LinkedIn and detects "drift mode" - when you're passively scrolling through the feed without engaging (scrolling a lot, typing little). After your set threshold, you'll receive a friendly nudge to help you refocus.

**Features:**
- **Cooldown Period**: After any nudge, no new nudges appear until the cooldown period expires (30 min for Basic, customizable for Pro)
- **Early Exit Detection**: If you leave LinkedIn within 2 minutes of a nudge, it's counted as an early exit
- **Weekly Reset**: Counters automatically reset every Monday at 00:00 local time

## Installation

### From Chrome Web Store (Coming Soon)
1. Visit the Chrome Web Store
2. Click "Add to Chrome"
3. Start using LinkedIn more intentionally!

### Manual Installation (Development)
1. Clone or download this repository
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `extension/` folder

## Usage

1. **Open LinkedIn** and navigate to your feed
2. **Access Options**: Right-click extension icon → Options, or go to `chrome://extensions` → Find "Focus Nudge" → Click "Options"
3. **Configure settings**:
   - Upgrade to Pro (if on Basic plan)
   - Set tone, drift threshold, and cooldown (Pro only)
   - View weekly summary
   - Manage subscription (Pro users)
4. **Use LinkedIn normally** - the extension works in the background
5. **Receive nudges** when you've been scrolling passively for too long

## Project Structure

```
focus-nudge-extension/
  extension/
    src/
      background/        # Service worker: metrics, early exit detection
      content/          # Content scripts: nudge display, behavior tracking
      shared/           # Shared modules: plan, metrics, settings
      ui/
        popup/          # Extension popup (minimal)
        options/        # Options page (full settings UI)
    manifest.json
    styles.css
    icons/
  scripts/              # Build scripts: version bump, ZIP creation
  store/                # Store assets: screenshots, listing text
  backend/              # Stripe payment processing and license verification
  README.md
```

## Development

### Building

```bash
# Create ZIP for Chrome Web Store
./scripts/create-zip.sh

# Build with version bump
./scripts/build.sh

# Build without version bump
./scripts/build.sh --no-bump

# Dev build (keeps dev toggle)
./scripts/build.sh dev
```

### Opening Options Page

1. **Via Extension Icon**: Right-click extension icon → Options
2. **Via Extensions Page**: `chrome://extensions` → Find "Focus Nudge" → Click "Options"
3. **Direct URL**: `chrome-extension://[EXTENSION_ID]/src/ui/options/options.html`

### Testing

1. **Basic Enforcement**: Verify Basic plan uses fixed settings (gentle tone, 15 min threshold, 30 min cooldown)
2. **Pro Features**: Upgrade to Pro, change settings, verify nudge uses new settings
3. **Cooldown**: Show nudge, verify no new nudges until cooldown expires
4. **Early Exit**: Show nudge, navigate away within 2 minutes, check counter increments
5. **Weekly Reset**: Counters automatically reset every Monday
6. **Payment Flow**: Test Stripe checkout, verify Pro activation after payment

## Privacy

Focus Nudge is designed with privacy in mind:
- ✅ No data collection or tracking
- ✅ All metrics stored locally in `chrome.storage.local`
- ✅ Only works on LinkedIn
- ✅ Backend only used for payment processing (Stripe) and license verification
- ✅ No personal data sent to backend (only anonymous user ID for license management)

## Technical Details

- **Manifest Version**: 3
- **Permissions**: `tabs`, `storage`
- **Host Permissions**: `https://www.linkedin.com/*`
- **Content Scripts**: Runs on LinkedIn pages only
- **Storage**: All data in `chrome.storage.local` (never synced)

## License

[Add your license here]

## Contributing

[Add contribution guidelines if open source]

## Support

[Add support/contact information]