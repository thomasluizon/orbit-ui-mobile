Pod::Spec.new do |s|
  s.name = 'OrbitWidget'
  s.version = '1.0.0'
  s.summary = 'Orbit home-screen widget adapter'
  s.description = 'Shares the current session and habit snapshot with WidgetKit.'
  s.license = 'MIT'
  s.author = 'Orbit'
  s.homepage = 'https://useorbit.org'
  s.source = { git: 'https://github.com/thomasluizon/orbit-ui-mobile.git' }
  s.platform = :ios, '17.4'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WidgetKit', 'Security', 'CryptoKit'
  s.source_files = 'OrbitWidgetModule.swift', 'Shared/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
