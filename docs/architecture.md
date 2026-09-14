# Session and interface design

The application has three distinct models: a reusable routine, a live session and a completed session record. A live session owns an immutable routine snapshot. A history record contains that snapshot plus actual timing and outcome. UI state such as an open sheet or search query stays in the relevant screen.

A single normalized timeline drives duration labels and timer transitions. React updates the display approximately ten times per second, while elapsed time is computed from timestamps rather than the number of ticks. This avoids drift when ticks arrive late. The timer advances over every crossed interval and emits only the current phase's audio request when catching up; it does not replay every missed song.

Audio side effects are serialized separately from timing. Newer phase requests supersede older queued requests. A stop waits for an in-flight load and then pauses/unloads it. Selecting a phase while paused defers playback until resume. A missing track reports an error without preventing the timer or later commands from working. Service failures are visible in the soundtrack panel.

Do not put authentication, billing or feed networking directly inside screen components. When these features are added, introduce service/repository boundaries and migrate local records deliberately. The existing local feed is an explicit preview; it is not presented as an online community.

Liquid Glass is a progressive enhancement: native material on compatible iOS, opaque accessible fallback where unavailable or reduced transparency is enabled. App theme is passed explicitly to the native glass view. The tab dock and interactive controls use glass; dense content, routine cards and forms retain solid surfaces for readability.

Training owns the routine editor and Activity navigation stack. History is reached from a header action rather than a peer tab. `IntervalPreview` is shared by Training and Discover and derives work/rest proportions from normalized routine data. `DurationField` provides the same minute/second sheet for global timing, per-round timing and preparation. Temporary picker state is local; applying writes through the existing form hook.

Before extending the app:

1. Define the data and failure behavior in the domain/service layer.
2. Add regression tests for meaningful state transitions or asynchronous races.
3. Connect UI actions through the session/provider boundary.
4. Verify the actual affected user flow on a device.
5. Treat a signed release, backend deployment and GitHub merge as separate operations.
