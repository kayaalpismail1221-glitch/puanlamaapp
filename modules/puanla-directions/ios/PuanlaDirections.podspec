Pod::Spec.new do |s|
  s.name           = 'PuanlaDirections'
  s.version        = '1.0.0'
  s.summary        = 'Uygulama içi yol tarifi (MapKit MKDirections)'
  s.description    = 'Puanla için Apple rota servisi köprüsü: rota çizgisi, süre, mesafe ve adımlar.'
  s.license        = 'UNLICENSED'
  s.author         = 'Puanla'
  s.homepage       = 'https://puanla.app'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MapKit'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
