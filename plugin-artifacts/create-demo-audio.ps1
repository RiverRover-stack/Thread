Add-Type -AssemblyName System.Speech
$demoVoice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$demoVoice.SetOutputToWaveFile('D:\Thread\plugin-artifacts\render-transcription-check.wav')
$demoVoice.Speak('I learn APIs better when I build one tiny request first.')
$demoVoice.Dispose()
Get-Item -LiteralPath 'D:\Thread\plugin-artifacts\render-transcription-check.wav' | Select-Object Length
