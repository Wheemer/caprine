!macro customInstall
  ; Remove old upstream Caprine registry entries after migrating to the Wheemer appId.
  ; Do not run the old uninstaller here: it points at the same install directory.
  SetRegView 64
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\b6c4192c-4ca1-5b79-a36d-5069848f8197"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\b6c4192c-4ca1-5b79-a36d-5069848f8197"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\com.sindresorhus.caprine"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\PushNotifications\Backup\com.sindresorhus.caprine"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Start\TileProperties\W~com.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\RunNotification" "StartupTNoticom.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FeatureUsage\AppBadgeUpdated" "com.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FeatureUsage\AppLaunch" "com.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FeatureUsage\AppSwitched" "com.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FeatureUsage\ShowJumpView" "com.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Search\JumplistData" "com.sindresorhus.caprine"
  SetRegView 32
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\b6c4192c-4ca1-5b79-a36d-5069848f8197"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\b6c4192c-4ca1-5b79-a36d-5069848f8197"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\com.sindresorhus.caprine"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\PushNotifications\Backup\com.sindresorhus.caprine"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Start\TileProperties\W~com.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\RunNotification" "StartupTNoticom.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FeatureUsage\AppBadgeUpdated" "com.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FeatureUsage\AppLaunch" "com.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FeatureUsage\AppSwitched" "com.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FeatureUsage\ShowJumpView" "com.sindresorhus.caprine"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Search\JumplistData" "com.sindresorhus.caprine"
  SetRegView lastused
!macroend
