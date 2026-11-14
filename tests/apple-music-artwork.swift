import Foundation
import MusicKit

@main
struct AppleMusicArtworkTests {
  static func main() throws {
    func artwork(_ url: String) throws -> Artwork {
      let data = try JSONSerialization.data(withJSONObject: ["width": 1200, "height": 1200, "url": url])
      return try JSONDecoder().decode(Artwork.self, from: data)
    }
    let template = try artwork("https://is1-ssl.mzstatic.com/image/thumb/cover/{w}x{h}bb.{f}")
    // Decode and size a real MusicKit Artwork rather than duplicating its URL logic.
    precondition(AppleMusicArtwork.url(template) == "https://is1-ssl.mzstatic.com/image/thumb/cover/300x300bb.jpg")
    let concrete = try artwork("https://is1-ssl.mzstatic.com/image/thumb/cover/{w}x{h}bb.jpg")
    precondition(AppleMusicArtwork.url(concrete) == "https://is1-ssl.mzstatic.com/image/thumb/cover/300x300bb.jpg")
    precondition(AppleMusicArtwork.url(nil) == "")
    print("PASS: MusicKit artwork templates, concrete URLs, and missing artwork")
  }
}
