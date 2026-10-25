import Dispatch
import ExpoModulesCore
import WidgetKit

public class OrbitWidgetModule: Module {
  private let queue = DispatchQueue(label: "org.useorbit.widget")

  public func definition() -> ModuleDefinition {
    Name("OrbitWidget")

    AsyncFunction("saveToken") { (token: String) in
      defer { WidgetCenter.shared.reloadTimelines(ofKind: "OrbitWidget") }
      try WidgetStore.configured().saveToken(token)
    }.runOnQueue(queue)

    AsyncFunction("clearToken") {
      defer { WidgetCenter.shared.reloadTimelines(ofKind: "OrbitWidget") }
      try WidgetStore.configured().clearToken()
    }.runOnQueue(queue)

    AsyncFunction("syncTheme") { (colors: [String: String]) in
      try WidgetStore.configured().saveTheme(colors)
      WidgetCenter.shared.reloadTimelines(ofKind: "OrbitWidget")
    }.runOnQueue(queue)

    AsyncFunction("syncWidgetData") { (json: String, token: String?) in
      if let token { try WidgetStore.configured().savePayload(json, authorizingToken: token) }
      WidgetCenter.shared.reloadTimelines(ofKind: "OrbitWidget")
    }.runOnQueue(queue)
  }
}
