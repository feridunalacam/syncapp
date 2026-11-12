import Foundation
import MusicKit

@available(iOS 16.0, *)
enum AppleMusicArtwork {
  static func url(_ artwork: Artwork?) -> String {
    // MusicKit replaces {w}/{h}, but some artwork templates retain {f} as %7Bf%7D.
    guard let url = artwork?.url(width: 300, height: 300)?.absoluteString else { return "" }
    return url
      .replacingOccurrences(of: "%7Bf%7D", with: "jpg", options: .caseInsensitive)
      .replacingOccurrences(of: "{f}", with: "jpg", options: .caseInsensitive)
  }
}
