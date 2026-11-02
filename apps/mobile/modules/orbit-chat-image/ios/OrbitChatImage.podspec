Pod::Spec.new do |s|
  s.name = 'OrbitChatImage'
  s.version = '1.0.0'
  s.summary = 'Chat image JPEG encoder'
  s.description = 'Composites chat attachments onto an opaque background before JPEG encoding.'
  s.license = 'MIT'
  s.author = 'Orbit'
  s.homepage = 'https://useorbit.org'
  s.source = { git: 'https://github.com/thomasluizon/orbit-ui-mobile.git' }
  s.platform = :ios, '17.4'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'UIKit'
  s.source_files = 'OrbitChatImageModule.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
