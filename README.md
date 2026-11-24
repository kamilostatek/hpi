HaierPi 1.4.5 Stable

Improvements and bug fixes

Pull Request #1 – Negative temperature decoding

Fixed incorrect decoding of negative temperatures in the PyHaier library.

Corrected 10 temperature conversion operations.

Pull Request #2 – Compressor diagnostics

Fixed reversed actual and target compressor frequency values (fact and fset).

Corrected Superheat and Subcooling calculations.

Removed absolute value conversion to preserve negative readings.

Pull Request #3 – MQTT Discovery

Improved Home Assistant MQTT Discovery handling.

Added cleanup of obsolete MQTT Discovery entities.

Pull Request #4 – Data freshness monitoring

Added freshness monitoring for R141 and R241 data frames.

Introduced a 180-second timeout for stale data.

Improved MQTT entity availability reporting in Home Assistant.

Separated MQTT connection status from heat pump data availability.

Additional fixes

Corrected actual and target compressor frequency mapping throughout HaierPi.

Fixed historical and live chart data mapping.

Fixed compressor frequency readings in the web interface and service panel.

Corrected compressor operation detection.

Corrected compressor frequency references in the Anti On-Off function.

Corrected compressor frequency references in DHW blocking and FLimit reset logic.

Preserved the existing Anti On-Off algorithm.

Ensured consistent compressor frequency mapping between HaierPi and Home Assistant.

Release and update improvements

Removed Alpha13 version identifiers.

Updated the application version to 1.4.5.

Updated the systemd service description and log identifier.

Added a dedicated Stable update script.

Added SHA256 package integrity verification.

Added automatic backup and rollback on update failure.

Preserved existing configuration, user accounts and historical chart data.

Thanks to all contributors for their pull requests, bug reports and support in improving HaierPi!
