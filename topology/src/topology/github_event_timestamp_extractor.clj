(ns topology.github-event-timestamp-extractor
  (:gen-class
    :name topology.github-event-timestamp-extractor.GithubEventTimestampExtractor
    :implements [org.apache.kafka.streams.processor.TimestampExtractor]
    :methods [[extract [org.apache.kafka.clients.consumer.ConsumerRecord long] long]]))

(defn -extract [_ record]
  (let [record-value (.value record)]
    ; json parse (.value record)
    ; .event.created_at
    ; iso 8601 => ms since epoch
    (prn record-value)
    0))
