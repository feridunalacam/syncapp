Pod::Spec.new do |s|
  s.name = 'SyncAppleMusic'
  s.version = '1.0.0'
  s.summary = 'Native MusicKit integration for Sync'
  s.description = 'Authorization, catalog, library and application playback using Apple MusicKit.'
  s.license = { :type => 'MIT' }
  s.author = 'Sync'
  s.homepage = 'https://developer.apple.com/musickit/'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MusicKit'
  s.swift_version = '5.9'
  s.source_files = '**/*.swift'
end
