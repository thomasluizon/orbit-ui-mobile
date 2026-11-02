import Dispatch
import ExpoModulesCore
import UIKit

public class OrbitChatImageModule: Module {
  private let queue = DispatchQueue(label: "org.useorbit.chat-image")

  public func definition() -> ModuleDefinition {
    Name("OrbitChatImage")

    AsyncFunction("saveJpeg") { (image: SharedRef<UIImage>, backgroundColor: UIColor, quality: Double) -> [String: Any] in
      guard let directory = self.appContext?.config.cacheDirectory, let pixels = image.ref.cgImage else {
        throw ChatImageEncodingException()
      }
      let size = CGSize(width: pixels.width, height: pixels.height)
      let bounds = CGRect(origin: .zero, size: size)
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      format.opaque = true
      let flattened = UIGraphicsImageRenderer(size: size, format: format).image { context in
        context.cgContext.setFillColor(backgroundColor.cgColor)
        context.cgContext.fill(bounds)
        image.ref.draw(in: bounds)
      }
      guard let encoded = flattened.jpegData(compressionQuality: quality) else {
        throw ChatImageEncodingException()
      }
      let cache = directory.appendingPathComponent("ChatImages", isDirectory: true)
      try FileManager.default.createDirectory(at: cache, withIntermediateDirectories: true)
      let output = cache.appendingPathComponent("\(UUID().uuidString).jpg")
      try encoded.write(to: output, options: .atomic)
      return ["uri": output.absoluteString, "width": pixels.width, "height": pixels.height]
    }.runOnQueue(queue)
  }
}

private final class ChatImageEncodingException: Exception {
  override var reason: String { "Chat image encoding failed" }
}
