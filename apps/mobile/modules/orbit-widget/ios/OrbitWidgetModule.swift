import Dispatch
import ExpoModulesCore
import WidgetKit

public class OrbitWidgetModule: Module {
  private let queue = DispatchQueue(label: "org.useorbit.widget")

  public func definition() -> ModuleDefinition {
    Name("OrbitWidget")

    AsyncFunction("saveToken") { (token: String) in
      try WidgetStore.configured().saveToken(token)
      WidgetCenter.shared.reloadTimelines(ofKind: "OrbitWidget")
    }.runOnQueue(queue)

    AsyncFunction("clearToken") {
      try WidgetStore.configured().clearToken()
      WidgetCenter.shared.reloadTimelines(ofKind: "OrbitWidget")
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
