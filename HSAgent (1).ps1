# Get specific system information
$systemInfo = systeminfo | Out-String

# Extract specific details
$hostname = [System.Net.Dns]::GetHostName()
$osName = (Get-WmiObject Win32_OperatingSystem).Caption
$osVersion = (Get-WmiObject Win32_OperatingSystem).Version
$osManufacturer = (Get-WmiObject Win32_OperatingSystem).Manufacturer
$osBuildType = (Get-WmiObject Win32_OperatingSystem).BuildType
$osConfiguration = (Get-WmiObject Win32_OperatingSystem).OSConfiguration
$registeredOwner = (Get-WmiObject Win32_OperatingSystem).RegisteredUser
$productID = (Get-WmiObject Win32_OperatingSystem).SerialNumber
$serialnumber = (Get-WmiObject Win32_BIOS).SerialNumber
$systemManufacturer = (Get-WmiObject Win32_ComputerSystem).Manufacturer
$systemModel = (Get-WmiObject Win32_ComputerSystem).Model
$processor = (Get-WmiObject Win32_Processor).Name
$domain = (Get-WmiObject Win32_ComputerSystem).Domain
$BIOSVersion = (Get-WmiObject Win32_BIOS).Version
$windowsDirectory = $env:windir
$systemDirectory = $env:SystemRoot
$systemLocale = (Get-WmiObject Win32_OperatingSystem).Locale
$timeZone = (Get-WmiObject Win32_TimeZone).Caption
$totalPhysicalMemory = (Get-WmiObject Win32_ComputerSystem).TotalPhysicalMemory
$virtualMemory = Get-WmiObject Win32_OperatingSystem | Select-Object Virtual*
$virtualMemoryMaxSize = $virtualMemory.MaxSize
$virtualMemoryAvailable = $virtualMemory.Available
$virtualMemoryInUse = $virtualMemory.InUse

# Get installed software

$installedSoftware = Get-WmiObject -Class Win32_Product | ForEach-Object {
    $name = $_.Name
    $vendor = $_.Vendor
    $version = $_.Version
    $installDate = $_.InstallDate

    # Format the string as "[Name], [Vendor], [Version], [InstallDate]"
    $formattedString = "`"$name`", `"$vendor`", `"$version`", `"$installDate`""
    return $formattedString
}

# Combine all software information into a single string separated by ", " for storage
$databaseString = $installedSoftware -join ", "

# Create JSON data
$jsonData = @{
    "computerName" = $hostname
    "hostname" = $hostname
    "osname" = $osName
    "serial" = $serialnumber
    "osversion" = $osVersion
    "osmanufacturer" = $osManufacturer
    "osbuildtype" = $osBuildType
    "osconfiguration" = $osConfiguration
    "registeredowner" = $registeredOwner
    "productid" = $productID
    "systemmanufacturer" = $systemManufacturer
    "systemmodel" = $systemModel
    "processor" = $processor
    "domain" = $domain
    "biosversion" = $BIOSVersion
    "windowsdirectory" = $windowsDirectory
    "systemdirectory" = $systemDirectory
    "systemlocale" = $systemLocale
    "totalphysicalram" = $totalPhysicalMemory
    "virtualrammax" = $virtualMemoryMaxSize
    "virtualramavailable" = $virtualMemoryAvailable
    "installedsoftware" = $databaseString -join ", "
    "createdBy" = "SAPL-0004"
} | ConvertTo-Json

# Send JSON data to the server
Invoke-RestMethod -Uri "http://10.5.5.209:3001/api/computers" -Method Post -Body $jsonData -ContentType "application/json"