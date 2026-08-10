# Kissflow Webhook URL
$webhookUrl = "https://development-refexgroup.kissflow.com/integration/2/AcCMptp3yqcn/webhook/7euKU1k3nPmMdUNx9soffBtCKLTgI5B61kO3tH-fjdy8EF9PeOthMkNevOJlK-LVwRntMHlW5P1On95OTuQ"

# Build JSON Payload
$payload = @{
    Computer_Name        = $hostname
    Host_Name            = $hostname
    Serial_Number        = $serialnumber
    OS_Name              = $osName
    OS_Version           = $osVersion
    OS_Manufacturer      = $osManufacturer
    OS_Build_Type        = $osBuildType
    OS_Configuration     = $osConfiguration
    Registered_Owner     = $registeredOwner
    Product_ID           = $productID
    System_Manufacturer  = $systemManufacturer
    System_Model         = $systemModel
    Processor            = $processor
    Domain               = $domain
    BIOS_Version         = $BIOSVersion
    Windows_Directory    = $windowsDirectory
    System_Directory     = $systemDirectory
    System_Locale        = $systemLocale
    Time_Zone            = $timeZone
    Total_Physical_RAM   = $totalPhysicalMemory
    Virtual_RAM_Max      = $virtualMemoryMaxSize
    Virtual_RAM_Available= $virtualMemoryAvailable
    Installed_Software   = $databaseString
    Created_By           = "SAPL-0004"
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod `
        -Uri $webhookUrl `
        -Method Post `
        -Body $payload `
        -ContentType "application/json"

    Write-Host "Successfully sent to Kissflow"
    $response
}
catch {
    Write-Host "Failed to send data"
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
}